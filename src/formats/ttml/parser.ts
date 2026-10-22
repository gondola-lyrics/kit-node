import type { runtime } from '@gondola-lyrics/model'
import type { XmlElement } from '@root/utils'
import type { ParseResult } from '../result'
import type { TtmlProfile } from './common'

import {
  AgentType,
  CreditRole,
  LyricStatus,
  Timing,
  deriveLanguageUsages,
  makeAgent,
  makeLineAnnotation,
  makeLineAnnotationRoman,
  makeLineAnnotationTranslation,
  makeLineBackground,
  makeLineContentText,
  makeLineContentWords,
  makeLineNormal,
  makeLyric,
  makeMeta,
  makeMetaCredit,
  makeText,
  makeTimeRange,
  makeUnknownEntry,
  makeWordAnnotation,
  makeWordAnnotationRuby,
  makeWordAnnotationToken,
  makeWordNormal,
  makeWordSpace,
} from '@gondola-lyrics/model/runtime'

import {
  XmlNodeType,
  findXmlElement,
  findXmlElements,
  getXmlAttribute,
  getXmlChildElements,
  getXmlQualifiedAttribute,
  getXmlTextContent,
  hasXmlChildElement,
  lowerTag,
  parseTime,
  parseXml,
} from '@root/utils'

import { finalizeLyric } from '../result'
import { FORMAT, AMLL_HINT_PATTERN, readTtmlContent } from './common'
import {
  ROLE_BACKGROUND,
  ROLE_ROMAN,
  ROLE_TRANSLATION,
  RUBY_BASE,
  RUBY_CONTAINER,
  RUBY_TEXT,
  RUBY_TEXT_CONTAINER,
  TIMING_LINE,
  TIMING_WORD,
} from './utils'

interface TokenDraft {
  start: number
  end: number
  text: string
}

interface RubyDraft {
  start: number
  end: number
  tokens: TokenDraft[]
}

interface WordDraft {
  text: string
  space: boolean
  start?: number
  end?: number
  rubies: RubyDraft[]
}

interface AnnotationDraft {
  language: string | undefined
  text: string
}

interface LineDraft {
  start: number
  end: number | undefined
  agentId: string | undefined
  key: string | undefined
  words: WordDraft[]
  translations: AnnotationDraft[]
  romans: AnnotationDraft[]
  backgrounds: LineDraft[]
  wordLevel: boolean
}

export type TtmlParseInput = string

export interface TtmlParseOptions {
  /** Language tag the lyric declares; the document's own `xml:lang` wins when it states one. */
  language?: string
}

const readTtmlProfile = (source: string): TtmlProfile => {
  return AMLL_HINT_PATTERN.test(source) ? 'amll' : 'itunes'
}

const readSpanTime = (element: XmlElement) => {
  const begin = getXmlAttribute(element, 'begin')
  const end = getXmlAttribute(element, 'end')
  if (!begin || !end) {
    return undefined
  }

  const start = parseTime(begin)
  const finish = parseTime(end)
  if (start === undefined || finish === undefined) {
    return undefined
  }

  return { start, end: finish }
}

const readLineTime = (element: XmlElement) => {
  const begin = getXmlAttribute(element, 'begin')
  if (!begin) {
    return undefined
  }

  const start = parseTime(begin)
  if (start === undefined) {
    return undefined
  }

  const end = getXmlAttribute(element, 'end')

  return { start, end: end ? parseTime(end) : undefined }
}

const readAgentType = (raw: string | undefined): { type: AgentType; raw: string | undefined } => {
  switch (raw) {
    case 'person':
      return { type: AgentType.PERSON, raw: undefined }
    case 'group':
      return { type: AgentType.GROUP, raw: undefined }
    default:
      return { type: AgentType.OTHER, raw: raw ?? 'other' }
  }
}

const readDeclaredTiming = (root: XmlElement): Timing | undefined => {
  switch (getXmlQualifiedAttribute(root, 'itunes:timing')) {
    case TIMING_WORD:
      return Timing.WORD
    case TIMING_LINE:
      return Timing.LINE
    default:
      return undefined
  }
}

/**
 * Preserves the parser's whitespace segmentation when turning text into word drafts.
 */
const splitWords = (text: string): WordDraft[] => {
  const words: WordDraft[] = []

  for (const run of text.split(/(\s+)/)) {
    if (run !== '') {
      words.push({ text: run, space: !run.trim(), rubies: [] })
    }
  }

  return words
}

/**
 * Distinguishes indentation runs from separators using the parser's existing rule.
 */
const isFormattingWhitespace = (text: string) => {
  return text.trim() === '' && text.includes('\n')
}

/**
 * Builds words from source drafts without deriving missing timestamps.
 */
const buildWords = (draft: LineDraft): runtime.Word[] => {
  const words: runtime.Word[] = []

  for (const word of draft.words) {
    if (word.space) {
      words.push(makeWordSpace({ text: word.text }))
      continue
    }

    const time = word.start === undefined ? undefined : makeTimeRange({ start: word.start, end: word.end })
    if (word.rubies.length === 0) {
      words.push(makeWordNormal({ text: word.text, time }))
      continue
    }

    const rubies = word.rubies.map((ruby) => {
      return makeWordAnnotationRuby({
        time: makeTimeRange({ start: ruby.start, end: ruby.end }),
        tokens: ruby.tokens.map((token) => {
          return makeWordAnnotationToken({ text: token.text, time: makeTimeRange({ start: token.start, end: token.end }) })
        }),
      })
    })

    words.push(makeWordNormal({ text: word.text, time, annotation: makeWordAnnotation({ rubies }) }))
  }

  return words
}

/**
 * Builds only annotations explicitly present in the source drafts.
 */
const buildLineAnnotation = (draft: LineDraft): runtime.LineAnnotation | undefined => {
  if (draft.translations.length === 0 && draft.romans.length === 0) {
    return undefined
  }

  return makeLineAnnotation({
    translations: draft.translations.map((item) => {
      return makeLineAnnotationTranslation({ text: item.text, language: item.language })
    }),
    romans: draft.romans.map((item) => {
      return makeLineAnnotationRoman({ text: item.text, language: item.language })
    }),
  })
}

/**
 * Separates head annotation text from its background references.
 */
const splitBackgroundText = (element: XmlElement) => {
  let main = ''
  const backgrounds: { text: string; key: string | undefined }[] = []

  for (const child of element.children) {
    if (child.nodeType === XmlNodeType.element && child.localName === 'span' && getXmlAttribute(child, 'role') === ROLE_BACKGROUND) {
      backgrounds.push({ text: getXmlTextContent(child).trim(), key: getXmlAttribute(child, 'for') })
      continue
    }
    main += getXmlTextContent(child)
  }

  return { main: main.trim(), backgrounds }
}

/**
 * Finds paragraphs in document order, including nested divs.
 */
const findParagraphs = (body: XmlElement): XmlElement[] => {
  const result: XmlElement[] = []
  const stack: XmlElement[] = [body]

  while (stack.length > 0) {
    const element = stack.pop()
    if (!element) {
      continue
    }
    if (element.localName === 'p') {
      result.push(element)
      continue
    }

    const children = element.children
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index]
      if (child && child.nodeType === XmlNodeType.element) {
        stack.push(child)
      }
    }
  }

  return result
}

/**
 * Reads an AMLL ruby container into one word plus its per-syllable annotation.
 */
const readRuby = (container: XmlElement): WordDraft | undefined => {
  let base = ''
  const tokens: TokenDraft[] = []

  for (const child of getXmlChildElements(container, 'span')) {
    const kind = getXmlAttribute(child, 'ruby')
    if (kind === RUBY_BASE) {
      base = getXmlTextContent(child).trim()
      continue
    }
    if (kind !== RUBY_TEXT_CONTAINER) {
      continue
    }

    for (const text of getXmlChildElements(child, 'span')) {
      if (getXmlAttribute(text, 'ruby') !== RUBY_TEXT) {
        continue
      }
      const time = readSpanTime(text)
      const content = getXmlTextContent(text).trim()
      if (time === undefined || !content) {
        continue
      }
      tokens.push({ start: time.start, end: time.end, text: content })
    }
  }

  const first = tokens[0]
  const last = tokens[tokens.length - 1]
  if (!base || first === undefined || last === undefined) {
    return undefined
  }

  return {
    text: base,
    space: false,
    start: first.start,
    end: last.end,
    rubies: [{ start: first.start, end: last.end, tokens }],
  }
}

/**
 * Collects the words of one span-bearing element.
 *
 * Text between spans carries the separators, and a span without both ends contributes its text untimed.
 * A span carrying a role is annotation rather than a word, so it is skipped here.
 * Indentation between tags is dropped, since the words themselves keep their own trailing spaces.
 */
const readWords = (element: XmlElement): { words: WordDraft[]; wordLevel: boolean } => {
  const words: WordDraft[] = []
  let wordLevel = false

  for (const child of element.children) {
    if (child.nodeType === XmlNodeType.text) {
      if (!isFormattingWhitespace(child.text)) {
        words.push(...splitWords(child.text))
      }
      continue
    }
    if (child.nodeType !== XmlNodeType.element || child.localName !== 'span') {
      continue
    }

    const role = getXmlAttribute(child, 'role')
    if (role !== undefined) {
      continue
    }

    if (getXmlAttribute(child, 'ruby') === RUBY_CONTAINER) {
      const ruby = readRuby(child)
      if (ruby !== undefined) {
        words.push(ruby)
        wordLevel = true
      }
      continue
    }

    const text = getXmlTextContent(child).trim()
    if (!text) {
      continue
    }

    const time = readSpanTime(child)
    if (time === undefined) {
      words.push({ text, space: false, rubies: [] })
      continue
    }

    wordLevel = true
    words.push({ text, space: false, start: time.start, end: time.end, rubies: [] })
  }

  return { words, wordLevel }
}

/**
 * Reads one paragraph, pulling its inline annotations and background lines out of the word stream.
 */
const readLine = (element: XmlElement): LineDraft | undefined => {
  const time = readLineTime(element)
  if (time === undefined) {
    return undefined
  }

  const draft: LineDraft = {
    start: time.start,
    end: time.end,
    agentId: getXmlAttribute(element, 'agent'),
    key: getXmlAttribute(element, 'key'),
    words: [],
    translations: [],
    romans: [],
    backgrounds: [],
    wordLevel: false,
  }

  if (!hasXmlChildElement(element, 'span')) {
    const plain = getXmlTextContent(element).trim()
    if (!plain) {
      return undefined
    }

    draft.words = splitWords(plain)
    return draft
  }

  const read = readWords(element)
  draft.words = read.words
  draft.wordLevel = read.wordLevel

  for (const span of getXmlChildElements(element, 'span')) {
    const role = getXmlAttribute(span, 'role')
    if (!role) {
      continue
    }

    if (role === ROLE_BACKGROUND) {
      const background = readBackground(span)
      if (background) {
        draft.backgrounds.push(background)
      }
      continue
    }

    const text = getXmlTextContent(span).trim()
    if (!text) {
      continue
    }

    const item = { language: lowerTag(getXmlAttribute(span, 'lang')), text }
    if (role === ROLE_TRANSLATION) {
      draft.translations.push(item)
    } else if (role === ROLE_ROMAN) {
      draft.romans.push(item)
    }
  }

  return draft
}

/**
 * Reads a background line, whose end may stay open because its parent's end covers it.
 *
 * A background line states no time of its own in AMLL files, so its range comes from its words.
 */
const readBackground = (element: XmlElement): LineDraft | undefined => {
  const read = readWords(element)
  if (read.words.length === 0) {
    return undefined
  }

  const begin = getXmlAttribute(element, 'begin')
  const end = getXmlAttribute(element, 'end')
  const first = read.words.find((word) => {
    return !word.space && word.start !== undefined
  })
  const last = read.words.findLast((word) => {
    return !word.space && word.start !== undefined
  })

  const start = begin === undefined ? (first?.start ?? 0) : parseTime(begin)
  if (start === undefined) {
    return undefined
  }

  const finish = end === undefined ? last?.end : parseTime(end)

  return {
    start,
    end: finish,
    agentId: getXmlAttribute(element, 'agent'),
    key: getXmlAttribute(element, 'key'),
    words: read.words,
    translations: [],
    romans: [],
    backgrounds: [],
    wordLevel: read.wordLevel,
  }
}

/**
 * Builds one background line.
 */
const buildBackground = (draft: LineDraft): runtime.LineBackground => {
  return makeLineBackground({
    id: draft.key,
    time: makeTimeRange({ start: draft.start, end: draft.end }),
    agents: draft.agentId === undefined ? [] : [draft.agentId],
    content: makeLineContentWords(buildWords(draft)),
    annotation: buildLineAnnotation(draft),
  })
}

/**
 * Builds one normal line, keeping plain text whole unless the source timed its words.
 */
const buildLine = (draft: LineDraft): runtime.Line => {
  const content = draft.wordLevel
    ? makeLineContentWords(buildWords(draft))
    : makeLineContentText(
        draft.words
          .map((word) => {
            return word.text
          })
          .join('')
          .trim(),
      )

  return makeLineNormal({
    id: draft.key,
    time: makeTimeRange({ start: draft.start, end: draft.end }),
    agents: draft.agentId === undefined ? [] : [draft.agentId],
    content,
    annotation: buildLineAnnotation(draft),
    backgrounds: draft.backgrounds.map(buildBackground),
  })
}

/**
 * Reads the head's agents, which lines reference by id.
 */
const readAgents = (metadata: XmlElement | undefined): runtime.Agent[] => {
  if (!metadata) {
    return []
  }

  const agents: runtime.Agent[] = []
  for (const element of findXmlElements(metadata, 'agent')) {
    const id = getXmlQualifiedAttribute(element, 'xml:id') ?? getXmlAttribute(element, 'id')
    if (!id) {
      continue
    }

    const names = getXmlChildElements(element, 'name')
      .map((name) => {
        return getXmlTextContent(name).trim()
      })
      .filter((name) => {
        return name !== ''
      })

    const kind = readAgentType(getXmlAttribute(element, 'type'))
    agents.push(
      makeAgent({
        id,
        type: kind.type,
        raw: kind.raw,
        names: names.map((name) => {
          return makeText({ text: name })
        }),
      }),
    )
  }

  return agents
}

/**
 * Reads the head's songwriters as one lyricist credit, since TTML does not split the role further.
 *
 * AMLL wraps these in `iTunesMetadata`, so the whole head is searched rather than its direct children.
 */
const readCredits = (metadata: XmlElement | undefined, meta: runtime.Meta) => {
  if (!metadata) {
    return
  }

  const names = findXmlElements(metadata, 'songwriter')
    .map((element) => {
      return getXmlTextContent(element).trim()
    })
    .filter((name) => {
      return name !== ''
    })

  if (names.length === 0) {
    return
  }

  meta.credits.push(
    makeMetaCredit({
      role: CreditRole.LYRICIST,
      names: names.map((name) => {
        return makeText({ text: name })
      }),
    }),
  )
}

/**
 * Reads one `amll:meta` entry, keeping an unknown key as written so a round trip loses nothing.
 */
const applyAmllMeta = (meta: runtime.Meta, element: XmlElement) => {
  const key = getXmlAttribute(element, 'key')
  const value = getXmlAttribute(element, 'value')?.trim()
  if (!key || !value) {
    return
  }

  switch (key) {
    case 'musicName':
      meta.titles.push(makeText({ text: value }))
      return
    case 'artists':
      meta.artists.push(makeText({ text: value }))
      return
    case 'album':
      meta.albums.push(makeText({ text: value }))
      return
    case 'isrc':
      meta.isrcs.push(value)
      return
    case 'ttmlAuthorGithubLogin':
      meta.authors.push(makeText({ text: value }))
      return
    default:
      meta.unknowns.push(makeUnknownEntry({ key, value }))
  }
}

/**
 * Attaches head translations and transliterations to the lines they name by `itunes:key`.
 *
 * A replacement translation rewrites the line's text, which is how a source swaps one script for another.
 */
const attachHeadAnnotations = (metadata: XmlElement | undefined, lineMap: Map<string, LineDraft>, backgroundMap: Map<string, LineDraft>) => {
  if (!metadata || lineMap.size === 0) {
    return
  }

  const attach = (blocks: XmlElement[], kind: 'translation' | 'roman') => {
    for (const block of blocks) {
      const language = lowerTag(getXmlAttribute(block, 'lang'))
      const type = getXmlQualifiedAttribute(block, 'type') ?? getXmlAttribute(block, 'type')

      for (const text of getXmlChildElements(block, 'text')) {
        const key = getXmlAttribute(text, 'for')
        const line = key ? lineMap.get(key) : undefined
        if (!line) {
          continue
        }

        const { main, backgrounds } = splitBackgroundText(text)
        if (kind === 'translation' && type === 'replacement') {
          if (main) {
            line.words = splitWords(main)
            line.wordLevel = false
          }
          continue
        }

        if (main) {
          const item = { language, text: main }
          if (kind === 'translation') {
            line.translations.push(item)
          } else {
            line.romans.push(item)
          }
        }

        for (const background of backgrounds) {
          if (!background.text) {
            continue
          }
          const target = background.key ? backgroundMap.get(background.key) : undefined
          if (!target) {
            continue
          }
          const item = { language, text: background.text }
          if (kind === 'translation') {
            target.translations.push(item)
          } else {
            target.romans.push(item)
          }
        }
      }
    }
  }

  attach(findXmlElements(metadata, 'translation'), 'translation')
  attach(findXmlElements(metadata, 'transliteration'), 'roman')
}

/**
 * Reads a TTML document into the model.
 *
 * The profile only changes where metadata comes from, so one reader serves both.
 * A document that parses but holds no timed paragraph is `INVALID` rather than an error.
 */
export const parseTtml = (input: TtmlParseInput, options: TtmlParseOptions = {}): ParseResult => {
  const content = readTtmlContent(input)
  if (!content) {
    return finalizeLyric(makeLyric({ format: FORMAT, status: LyricStatus.INVALID, meta: makeMeta() }))
  }

  const extra = {
    profile: readTtmlProfile(content),
  }

  const document = parseXml(content)
  const root = document ? findXmlElement(document, 'tt') : undefined
  if (!root) {
    return finalizeLyric(makeLyric({ format: FORMAT, status: LyricStatus.INVALID, meta: makeMeta(), extra }))
  }

  const body = findXmlElement(root, 'body')
  const metadata = findXmlElement(root, 'metadata')
  const meta = makeMeta()

  const language = lowerTag(getXmlQualifiedAttribute(root, 'xml:lang')) ?? lowerTag(options.language)
  if (language !== undefined) {
    meta.language = language
  }

  readCredits(metadata, meta)
  for (const element of metadata ? findXmlElements(metadata, 'meta') : []) {
    applyAmllMeta(meta, element)
  }

  const drafts: LineDraft[] = []
  const lineMap = new Map<string, LineDraft>()
  const backgroundMap = new Map<string, LineDraft>()

  for (const element of body ? findParagraphs(body) : []) {
    const draft = readLine(element)
    if (!draft) {
      continue
    }

    drafts.push(draft)
    if (draft.key) {
      lineMap.set(draft.key, draft)
    }
    for (const background of draft.backgrounds) {
      if (background.key) {
        backgroundMap.set(background.key, background)
      }
    }
  }

  attachHeadAnnotations(metadata, lineMap, backgroundMap)

  if (drafts.length === 0) {
    return finalizeLyric(makeLyric({ format: FORMAT, status: LyricStatus.INVALID, meta, extra }))
  }

  const lines = drafts.map(buildLine)
  const wordLevel = drafts.some((draft) => {
    return draft.wordLevel
  })

  return finalizeLyric(
    makeLyric({
      format: FORMAT,
      status: LyricStatus.VALID,
      timing: readDeclaredTiming(root) ?? (wordLevel ? Timing.WORD : Timing.LINE),
      meta,
      extra,
      agents: readAgents(metadata),
      languages: deriveLanguageUsages(lines),
      lines,
    }),
  )
}
