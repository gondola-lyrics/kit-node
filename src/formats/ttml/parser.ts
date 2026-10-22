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
  start?: number
  end?: number
  text: string
}

interface RubyDraft {
  start?: number
  end?: number
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
  preserveSpace: boolean
}

interface ElementContext {
  element: XmlElement
  preserveSpace: boolean
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

const readLineTime = (element: XmlElement) => {
  return readSpanTime(element)
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

const readPreserveSpace = (element: XmlElement, inherited: boolean): boolean => {
  switch (getXmlQualifiedAttribute(element, 'xml:space')) {
    case 'preserve':
      return true
    case 'default':
      return false
    default:
      return inherited
  }
}

const readText = (element: XmlElement, inherited: boolean): string => {
  const text = getXmlTextContent(element)
  return readPreserveSpace(element, inherited) ? text : text.trim()
}

/**
 * Preserves the parser's whitespace segmentation when turning text into word drafts.
 */
const splitWords = (text: string): WordDraft[] => {
  const words: WordDraft[] = []

  for (const run of text.split(/(\p{White_Space}+)/u)) {
    if (run !== '') {
      words.push({ text: run, space: /^\p{White_Space}+$/u.test(run), rubies: [] })
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
        time: ruby.start === undefined ? undefined : makeTimeRange({ start: ruby.start, end: ruby.end }),
        tokens: ruby.tokens.map((token) => {
          return makeWordAnnotationToken({
            text: token.text,
            time: token.start === undefined ? undefined : makeTimeRange({ start: token.start, end: token.end }),
          })
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
const splitBackgroundText = (element: XmlElement, preserveSpace: boolean) => {
  preserveSpace = readPreserveSpace(element, preserveSpace)
  let main = ''
  const backgrounds: { text: string; key: string | undefined }[] = []

  for (const child of element.children) {
    if (child.nodeType === XmlNodeType.element && child.localName === 'span' && getXmlAttribute(child, 'role') === ROLE_BACKGROUND) {
      backgrounds.push({ text: readText(child, preserveSpace), key: getXmlAttribute(child, 'for') })
      continue
    }
    main += getXmlTextContent(child)
  }

  return { main: preserveSpace ? main : main.trim(), backgrounds }
}

/**
 * Carries whitespace declarations through wrappers to the elements they govern.
 */
const findElements = (root: XmlElement, name: string, preserveSpace: boolean, stopAtMatch = false): ElementContext[] => {
  const result: ElementContext[] = []
  const stack: ElementContext[] = [{ element: root, preserveSpace }]

  while (stack.length > 0) {
    const entry = stack.pop()
    if (entry === undefined) {
      continue
    }
    const element = entry.element
    const currentSpace = readPreserveSpace(element, entry.preserveSpace)
    if (element.localName === name) {
      result.push({ element, preserveSpace: currentSpace })
      if (stopAtMatch) {
        continue
      }
    }

    const children = element.children
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index]
      if (child && child.nodeType === XmlNodeType.element) {
        stack.push({ element: child, preserveSpace: currentSpace })
      }
    }
  }

  return result
}

/**
 * Reads an AMLL ruby container into one word plus its per-syllable annotation.
 */
const readRuby = (container: XmlElement, preserveSpace: boolean): WordDraft | undefined => {
  preserveSpace = readPreserveSpace(container, preserveSpace)
  let base = ''
  let rubyTime: ReturnType<typeof readSpanTime>
  const tokens: TokenDraft[] = []

  for (const child of getXmlChildElements(container, 'span')) {
    const kind = getXmlAttribute(child, 'ruby')
    if (kind === RUBY_BASE) {
      base = readText(child, preserveSpace)
      continue
    }
    if (kind !== RUBY_TEXT_CONTAINER) {
      continue
    }

    rubyTime ??= readSpanTime(child)
    const rubySpace = readPreserveSpace(child, preserveSpace)
    for (const text of getXmlChildElements(child, 'span')) {
      if (getXmlAttribute(text, 'ruby') !== RUBY_TEXT) {
        continue
      }
      const time = readSpanTime(text)
      const content = readText(text, rubySpace)
      if (!content) {
        continue
      }
      tokens.push({ start: time?.start, end: time?.end, text: content })
    }
  }

  if (!base) {
    return undefined
  }

  const first = tokens.find((token) => {
    return token.start !== undefined
  })
  const last = tokens.findLast((token) => {
    return token.start !== undefined
  })
  // Older AMLL containers state timing only on their annotation tokens.
  const time = readSpanTime(container) ?? rubyTime ?? (first === undefined ? undefined : { start: first.start, end: last?.end })

  return {
    text: base,
    space: false,
    start: time?.start,
    end: time?.end,
    rubies: tokens.length === 0 ? [] : [{ start: rubyTime?.start, end: rubyTime?.end, tokens }],
  }
}

/**
 * Collects the words of one span-bearing element.
 *
 * Text between spans carries the separators, and a span without a readable begin contributes its text untimed.
 * A span carrying a role is annotation rather than a word, so it is skipped here.
 * Whitespace inside a span remains a separator; indentation is dropped only without a preserve declaration.
 */
const readWords = (element: XmlElement, preserveSpace: boolean): { words: WordDraft[]; wordLevel: boolean } => {
  preserveSpace = readPreserveSpace(element, preserveSpace)
  const words: WordDraft[] = []
  let wordLevel = false

  for (const child of element.children) {
    if (child.nodeType !== XmlNodeType.element) {
      if (preserveSpace || !isFormattingWhitespace(child.text)) {
        words.push(...splitWords(child.text))
      }
      continue
    }
    if (child.localName !== 'span') {
      continue
    }

    const role = getXmlAttribute(child, 'role')
    if (role !== undefined) {
      continue
    }

    if (getXmlAttribute(child, 'ruby') === RUBY_CONTAINER) {
      const ruby = readRuby(child, preserveSpace)
      if (ruby !== undefined) {
        for (const part of splitWords(ruby.text)) {
          words.push(part.space ? part : { ...ruby, text: part.text })
        }
        wordLevel ||= ruby.start !== undefined
      }
      continue
    }

    const text = getXmlTextContent(child)
    const childSpace = readPreserveSpace(child, preserveSpace)
    if (!text || (!childSpace && isFormattingWhitespace(text))) {
      continue
    }

    const time = readSpanTime(child)
    for (const part of splitWords(text)) {
      if (!part.space && time !== undefined) {
        part.start = time.start
        part.end = time.end
        wordLevel = true
      }
      words.push(part)
    }
  }

  return { words, wordLevel }
}

const readInlineAnnotations = (element: XmlElement, preserveSpace: boolean): Pick<LineDraft, 'translations' | 'romans'> => {
  const translations: AnnotationDraft[] = []
  const romans: AnnotationDraft[] = []

  for (const span of getXmlChildElements(element, 'span')) {
    const role = getXmlAttribute(span, 'role')
    if (role !== ROLE_TRANSLATION && role !== ROLE_ROMAN) {
      continue
    }
    const text = readText(span, preserveSpace)
    if (!text) {
      continue
    }

    const item = { language: lowerTag(getXmlAttribute(span, 'lang')), text }
    if (role === ROLE_TRANSLATION) {
      translations.push(item)
    } else {
      romans.push(item)
    }
  }

  return { translations, romans }
}

/**
 * Reads one paragraph, pulling its inline annotations and background lines out of the word stream.
 */
const readLine = (element: XmlElement, preserveSpace: boolean): LineDraft | undefined => {
  preserveSpace = readPreserveSpace(element, preserveSpace)
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
    preserveSpace,
  }

  if (!hasXmlChildElement(element, 'span')) {
    const plain = readText(element, preserveSpace)
    if (!plain) {
      return undefined
    }

    draft.words = splitWords(plain)
    return draft
  }

  const read = readWords(element, preserveSpace)
  draft.words = read.words
  draft.wordLevel = read.wordLevel
  const annotations = readInlineAnnotations(element, preserveSpace)
  draft.translations = annotations.translations
  draft.romans = annotations.romans

  for (const span of getXmlChildElements(element, 'span')) {
    const role = getXmlAttribute(span, 'role')
    if (role === ROLE_BACKGROUND) {
      const background = readBackground(span, preserveSpace)
      if (background) {
        draft.backgrounds.push(background)
      }
    }
  }

  return draft
}

/**
 * Reads a background line, whose end may stay open because its parent's end covers it.
 *
 * A background line states no time of its own in AMLL files, so its range comes from its words.
 */
const readBackground = (element: XmlElement, preserveSpace: boolean): LineDraft | undefined => {
  preserveSpace = readPreserveSpace(element, preserveSpace)
  const read = readWords(element, preserveSpace)
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
    ...readInlineAnnotations(element, preserveSpace),
    backgrounds: [],
    wordLevel: read.wordLevel,
    preserveSpace,
  }
}

const buildContent = (draft: LineDraft): runtime.LineContent => {
  if (draft.wordLevel) {
    return makeLineContentWords(buildWords(draft))
  }

  const text = draft.words
    .map((word) => {
      return word.text
    })
    .join('')
  return makeLineContentText(draft.preserveSpace ? text : text.trim())
}

/**
 * Builds one background line.
 */
const buildBackground = (draft: LineDraft): runtime.LineBackground => {
  return makeLineBackground({
    id: draft.key,
    time: makeTimeRange({ start: draft.start, end: draft.end }),
    agents: draft.agentId === undefined ? [] : [draft.agentId],
    content: buildContent(draft),
    annotation: buildLineAnnotation(draft),
  })
}

/**
 * Builds one normal line, keeping plain text whole unless the source timed its words.
 */
const buildLine = (draft: LineDraft): runtime.Line => {
  return makeLineNormal({
    id: draft.key,
    time: makeTimeRange({ start: draft.start, end: draft.end }),
    agents: draft.agentId === undefined ? [] : [draft.agentId],
    content: buildContent(draft),
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
const attachHeadAnnotations = (metadata: ElementContext | undefined, lineMap: Map<string, LineDraft>, backgroundMap: Map<string, LineDraft>) => {
  if (!metadata || lineMap.size === 0) {
    return
  }

  const attach = (blocks: ElementContext[], kind: 'translation' | 'roman') => {
    for (const { element: block, preserveSpace } of blocks) {
      const language = lowerTag(getXmlAttribute(block, 'lang'))
      const type = getXmlQualifiedAttribute(block, 'type') ?? getXmlAttribute(block, 'type')

      for (const text of getXmlChildElements(block, 'text')) {
        const key = getXmlAttribute(text, 'for')
        const line = key ? lineMap.get(key) : undefined
        if (!line) {
          continue
        }

        const { main, backgrounds } = splitBackgroundText(text, preserveSpace)
        if (kind === 'translation' && type === 'replacement') {
          if (main) {
            line.words = splitWords(main)
            line.wordLevel = false
            line.preserveSpace = readPreserveSpace(text, preserveSpace)
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

  attach(findElements(metadata.element, 'translation', metadata.preserveSpace), 'translation')
  attach(findElements(metadata.element, 'transliteration', metadata.preserveSpace), 'roman')
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

  const body = findElements(root, 'body', false, true)[0]
  const metadata = findElements(root, 'metadata', false, true)[0]
  const meta = makeMeta()

  const language = lowerTag(getXmlQualifiedAttribute(root, 'xml:lang')) ?? lowerTag(options.language)
  if (language !== undefined) {
    meta.language = language
  }

  readCredits(metadata?.element, meta)
  for (const element of metadata ? findXmlElements(metadata.element, 'meta') : []) {
    applyAmllMeta(meta, element)
  }

  const drafts: LineDraft[] = []
  const lineMap = new Map<string, LineDraft>()
  const backgroundMap = new Map<string, LineDraft>()

  for (const { element, preserveSpace } of body ? findElements(body.element, 'p', body.preserveSpace, true) : []) {
    const draft = readLine(element, preserveSpace)
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
    return (
      draft.wordLevel ||
      draft.backgrounds.some((background) => {
        return background.wordLevel
      })
    )
  })

  return finalizeLyric(
    makeLyric({
      format: FORMAT,
      status: LyricStatus.VALID,
      timing: readDeclaredTiming(root) ?? (wordLevel ? Timing.WORD : Timing.LINE),
      meta,
      extra,
      agents: readAgents(metadata?.element),
      languages: deriveLanguageUsages(lines),
      lines,
    }),
  )
}
