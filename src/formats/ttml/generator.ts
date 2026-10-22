import type { runtime } from '@gondola-lyrics/model'
import type { XmlElement, XmlNode } from '@root/utils'
import type { TtmlProfile } from './common'

import {
  AgentType,
  CreditRole,
  LineType,
  Timing,
  WordType,
  removeOffset,
  resolveAnnotationItemTime,
  resolveAnnotationTokenTime,
} from '@gondola-lyrics/model/runtime'

import { createXmlElement, createXmlText, serializeXml } from '@root/utils'

import { FORMAT } from './common'
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

export type TtmlGenerateResult = string

export interface TtmlGenerateOptions {
  /**
   * Defaults to the source TTML profile, or `amll` when the lyric came from another format.
   */
  profile?: TtmlProfile
  /**
   * Indent document structure; defaults to `false`.
   * Lyric content stays flush to keep formatting whitespace out of the words.
   */
  indent?: boolean
  /**
   * Emit song metadata; defaults to `true`.
   * Agents and annotation tracks are retained because the body references them.
   */
  includeMeta?: boolean
}

type SungLine = runtime.Line | runtime.LineBackground

type Attributes = [string, string][]

type AnnotationKind = 'translations' | 'romans'

type AnnotationTracks = Map<string | undefined, Map<runtime.Line, XmlNode[]>>

type ResolvedTtmlGenerateOptions = Required<TtmlGenerateOptions>

interface RenderContext {
  profile: TtmlProfile
  offset: number
  keys: Map<SungLine, string>
  agents: Map<string, string>
}

const NAMESPACE_TTML = 'http://www.w3.org/ns/ttml'
const NAMESPACE_TTML_METADATA = 'http://www.w3.org/ns/ttml#metadata'
const NAMESPACE_TTML_STYLING = 'http://www.w3.org/ns/ttml#styling'
const NAMESPACE_ITUNES = 'http://itunes.apple.com/lyric-ttml-extensions'
const NAMESPACE_ITUNES_METADATA = 'http://music.apple.com/lyric-ttml-internal'
const NAMESPACE_AMLL = 'http://www.example.com/ns/amll'

const ANNOTATION_KINDS = ['translations', 'romans'] as const

const XML_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/

const resolveOptions = (lyric: runtime.Lyric, options: TtmlGenerateOptions): ResolvedTtmlGenerateOptions => {
  const profile = options.profile ?? (lyric.format === FORMAT && lyric.extra.profile === 'itunes' ? 'itunes' : 'amll')
  if (profile !== 'amll' && profile !== 'itunes') {
    throw new Error('Unsupported TTML profile')
  }

  return { profile, includeMeta: options.includeMeta ?? true, indent: options.indent ?? false }
}

/**
 * Reserves source ids before allocating keys, so unnamed entries cannot take later source ids.
 */
const makeIdAllocator = (ids: string[]) => {
  const reserved = new Set(
    ids.filter((id) => {
      return XML_ID_PATTERN.test(id)
    }),
  )
  const used = new Set<string>()
  const counters = new Map<string, number>()

  return (preferred: string, prefix: string) => {
    if (XML_ID_PATTERN.test(preferred) && !used.has(preferred)) {
      used.add(preferred)
      return preferred
    }

    let count = counters.get(prefix) ?? 0
    let id: string
    do {
      count += 1
      id = `${prefix}${count}`
    } while (reserved.has(id) || used.has(id))

    counters.set(prefix, count)
    used.add(id)
    return id
  }
}

/**
 * Shares one mapping between declarations, body lines, and annotation references.
 */
const makeContext = (lyric: runtime.Lyric, lines: runtime.Line[], profile: TtmlProfile): RenderContext => {
  const ids = lyric.agents.map((agent) => {
    return agent.id
  })
  for (const line of lines) {
    ids.push(line.id)
    for (const background of line.backgrounds) {
      ids.push(background.id)
    }
  }

  const allocate = makeIdAllocator(ids)
  const agents = new Map<string, string>()
  const keys = new Map<SungLine, string>()

  for (const agent of lyric.agents) {
    if (agents.has(agent.id)) {
      throw new Error('TTML agent declarations require unique ids')
    }
    agents.set(agent.id, allocate(agent.id, 'v'))
  }
  for (const line of lines) {
    keys.set(line, allocate(line.id, 'L'))
    for (const background of line.backgrounds) {
      keys.set(background, allocate(background.id, 'B'))
    }
  }

  return { profile, offset: lyric.meta?.offset ?? 0, keys, agents }
}

/**
 * Bakes the playback offset into TTML timestamps without clamping negative results.
 */
const renderTime = (time: number, offset: number) => {
  const shifted = removeOffset(time, offset)
  if (!Number.isInteger(shifted) || shifted < 0) {
    throw new RangeError('TTML timestamps must be non-negative integer milliseconds after applying the offset')
  }

  const seconds = Math.floor(shifted / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0')
  const milliseconds = String(shifted % 1000).padStart(3, '0')

  return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.${milliseconds}`
}

/**
 * Writes known bounds without inventing an end.
 */
const renderTimeAttributes = (time: runtime.TimeRange | undefined, offset: number): Attributes => {
  if (time === undefined) {
    throw new Error('TTML sung lines, words, and ruby tokens require a time range')
  }

  const attributes: Attributes = [['begin', renderTime(time.start, offset)]]
  if (time.end !== undefined) {
    attributes.push(['end', renderTime(time.end, offset)])
  }
  return attributes
}

/**
 * Clears inherited language when the model leaves an item's language unspecified.
 */
const renderLanguage = (language: string | undefined, inherited?: string): Attributes => {
  if (language !== undefined) {
    return [['xml:lang', language]]
  }

  return inherited === undefined ? [] : [['xml:lang', '']]
}

const getLineLanguage = (line: SungLine): string | undefined => {
  return line.languages.length === 1 ? line.languages[0] : undefined
}

/**
 * Writes separators as text and resolves inherited ruby timing through the model.
 */
const renderWord = (word: runtime.Word, context: RenderContext, language?: string): XmlNode => {
  if (word.type === WordType.SPACE) {
    return createXmlText(word.text)
  }

  const attributes = [...renderTimeAttributes(word.time, context.offset), ...renderLanguage(word.language, language)]
  const ruby = context.profile === 'amll' ? word.annotation?.rubies[0] : undefined
  if (ruby === undefined) {
    return createXmlElement('span', attributes, [createXmlText(word.text)])
  }

  const tokens = ruby.tokens.map((token) => {
    return createXmlElement(
      'span',
      [['tts:ruby', RUBY_TEXT], ...renderTimeAttributes(resolveAnnotationTokenTime(token, ruby, word), context.offset)],
      [createXmlText(token.text)],
    )
  })

  return createXmlElement(
    'span',
    [['tts:ruby', RUBY_CONTAINER], ...attributes],
    [
      createXmlElement('span', [['tts:ruby', RUBY_BASE]], [createXmlText(word.text)]),
      createXmlElement(
        'span',
        [
          ['tts:ruby', RUBY_TEXT_CONTAINER],
          ...renderTimeAttributes(resolveAnnotationItemTime(ruby, word), context.offset),
          ...renderLanguage(ruby.language, word.language),
        ],
        tokens,
      ),
    ],
  )
}

/**
 * Retains the model's choice between whole text and timed words.
 */
const renderContent = (line: SungLine, context: RenderContext): XmlNode[] => {
  const content = line.content
  if (content === undefined) {
    throw new Error('TTML sung lines require content')
  }
  if (content.text !== undefined) {
    return [createXmlText(content.text)]
  }

  return content.words.map((word) => {
    return renderWord(word, context, getLineLanguage(line))
  })
}

/**
 * Keeps annotations outside the sung word stream.
 */
const renderInlineAnnotations = (annotation: runtime.LineAnnotation | undefined, language?: string): XmlElement[] => {
  const nodes: XmlElement[] = []
  for (const item of annotation?.translations ?? []) {
    nodes.push(createXmlElement('span', [['ttm:role', ROLE_TRANSLATION], ...renderLanguage(item.language, language)], [createXmlText(item.text)]))
  }
  for (const item of annotation?.romans ?? []) {
    nodes.push(createXmlElement('span', [['ttm:role', ROLE_ROMAN], ...renderLanguage(item.language, language)], [createXmlText(item.text)]))
  }
  return nodes
}

/**
 * Uses the same allocated keys and agent ids as the document's declarations.
 */
const renderLineAttributes = (line: SungLine, context: RenderContext): Attributes => {
  const attributes: Attributes = [
    ...renderTimeAttributes(line.time, context.offset),
    ['itunes:key', context.keys.get(line)!],
    ['xml:space', 'preserve'],
    ['xml:lang', getLineLanguage(line) ?? ''],
  ]
  const lead = line.agents[0]
  if (lead !== undefined) {
    const id = context.agents.get(lead)
    if (id === undefined) {
      throw new Error('TTML performing agents must have a declaration')
    }
    attributes.push(['ttm:agent', id])
  }
  return attributes
}

/**
 * An empty text node keeps the XML writer's indentation outside lyric content.
 */
const createLyricElement = (name: string, attributes: Attributes, children: XmlNode[]) => {
  return createXmlElement(name, attributes, [createXmlText(''), ...children])
}

const renderBackground = (line: runtime.LineBackground, context: RenderContext) => {
  const children = renderContent(line, context)
  if (context.profile === 'amll') {
    children.push(...renderInlineAnnotations(line.annotation, getLineLanguage(line)))
  }

  return createXmlElement('span', [['ttm:role', ROLE_BACKGROUND], ...renderLineAttributes(line, context)], children)
}

const renderLine = (line: runtime.Line, context: RenderContext) => {
  const before: XmlNode[] = []
  const after: XmlNode[] = []
  for (const background of line.backgrounds) {
    const node = renderBackground(background, context)
    if (background.time !== undefined && line.time !== undefined && background.time.start < line.time.start) {
      before.push(node)
    } else {
      after.push(node)
    }
  }

  const children = [...before, ...renderContent(line, context), ...after]
  if (context.profile === 'amll') {
    children.push(...renderInlineAnnotations(line.annotation, getLineLanguage(line)))
  }
  return createLyricElement('p', renderLineAttributes(line, context), children)
}

const renderAgents = (lyric: runtime.Lyric, context: RenderContext) => {
  return lyric.agents.map((agent) => {
    const type = agent.type === AgentType.PERSON ? 'person' : agent.type === AgentType.GROUP ? 'group' : (agent.raw ?? 'other')
    const names = agent.names.map((name) => {
      return createXmlElement('ttm:name', [['type', 'full'], ...renderLanguage(name.language)], [createXmlText(name.text)])
    })

    return createXmlElement(
      'ttm:agent',
      [
        ['type', type],
        ['xml:id', context.agents.get(agent.id)!],
      ],
      names,
    )
  })
}

const renderAmllMeta = (meta: runtime.Meta): XmlElement[] => {
  const nodes: XmlElement[] = []
  const groups: [string, runtime.Text[]][] = [
    ['musicName', meta.titles],
    ['artists', meta.artists],
    ['album', meta.albums],
    ['ttmlAuthorGithubLogin', meta.authors],
  ]
  for (const [key, items] of groups) {
    for (const item of items) {
      nodes.push(createXmlElement('amll:meta', [['key', key], ['value', item.text], ...renderLanguage(item.language)]))
    }
  }
  for (const value of meta.isrcs) {
    nodes.push(
      createXmlElement('amll:meta', [
        ['key', 'isrc'],
        ['value', value],
      ]),
    )
  }
  for (const item of meta.unknowns) {
    nodes.push(
      createXmlElement('amll:meta', [
        ['key', item.key],
        ['value', item.value],
      ]),
    )
  }
  return nodes
}

const renderSongwriters = (meta: runtime.Meta): XmlElement[] => {
  const names: XmlElement[] = []
  for (const credit of meta.credits) {
    if (credit.role !== CreditRole.LYRICIST) {
      continue
    }
    for (const name of credit.names) {
      names.push(createXmlElement('songwriter', renderLanguage(name.language), [createXmlText(name.text)]))
    }
  }
  return names.length === 0 ? [] : [createXmlElement('songwriters', [], names)]
}

const renderAnnotationTracks = (tracks: AnnotationTracks, kind: AnnotationKind, context: RenderContext): XmlElement[] => {
  if (tracks.size === 0) {
    return []
  }

  const translated = kind === 'translations'
  const blocks = Array.from(tracks, ([language, track]) => {
    const attributes: Attributes = translated ? [['type', 'subtitle']] : []
    attributes.push(...renderLanguage(language))
    const texts = Array.from(track, ([line, children]) => {
      return createLyricElement(
        'text',
        [
          ['for', context.keys.get(line)!],
          ['xml:space', 'preserve'],
        ],
        children,
      )
    })
    return createXmlElement(translated ? 'translation' : 'transliteration', attributes, texts)
  })

  return [createXmlElement(translated ? 'translations' : 'transliterations', [], blocks)]
}

/**
 * A background-only annotation still references its parent paragraph, with a second reference naming the background.
 */
const renderHeadAnnotations = (lines: runtime.Line[], context: RenderContext): XmlElement[] => {
  const tracks: Record<AnnotationKind, AnnotationTracks> = { translations: new Map(), romans: new Map() }
  const append = (annotation: runtime.LineAnnotation | undefined, line: runtime.Line, background?: runtime.LineBackground) => {
    if (annotation === undefined) {
      return
    }

    for (const kind of ANNOTATION_KINDS) {
      for (const item of annotation[kind]) {
        const language = item.language?.toLowerCase()
        let track = tracks[kind].get(language)
        if (track === undefined) {
          track = new Map()
          tracks[kind].set(language, track)
        }
        let nodes = track.get(line)
        if (nodes === undefined) {
          nodes = []
          track.set(line, nodes)
        }

        nodes.push(
          background === undefined
            ? createXmlText(item.text)
            : createXmlElement(
                'span',
                [
                  ['ttm:role', ROLE_BACKGROUND],
                  ['for', context.keys.get(background)!],
                ],
                [createXmlText(item.text)],
              ),
        )
      }
    }
  }

  for (const line of lines) {
    append(line.annotation, line)
    for (const background of line.backgrounds) {
      append(background.annotation, line, background)
    }
  }

  return ANNOTATION_KINDS.flatMap((kind) => {
    return renderAnnotationTracks(tracks[kind], kind, context)
  })
}

const renderMetadata = (lyric: runtime.Lyric, lines: runtime.Line[], context: RenderContext, includeMeta: boolean): XmlElement => {
  const metadata = renderAgents(lyric, context)
  const itunes: XmlElement[] = []
  if (includeMeta && lyric.meta !== undefined) {
    if (context.profile === 'amll') {
      metadata.push(...renderAmllMeta(lyric.meta))
    }
    itunes.push(...renderSongwriters(lyric.meta))
  }
  if (context.profile === 'itunes') {
    itunes.push(...renderHeadAnnotations(lines, context))
  }
  if (itunes.length > 0) {
    metadata.push(createXmlElement('iTunesMetadata', [['xmlns', NAMESPACE_ITUNES_METADATA]], itunes))
  }

  return createXmlElement('metadata', renderLanguage(undefined, lyric.meta?.language), metadata)
}

const renderRootAttributes = (lyric: runtime.Lyric, profile: TtmlProfile): Attributes => {
  const attributes: Attributes = [
    ['xmlns', NAMESPACE_TTML],
    ['xmlns:ttm', NAMESPACE_TTML_METADATA],
    ['xmlns:tts', NAMESPACE_TTML_STYLING],
    ['xmlns:itunes', NAMESPACE_ITUNES],
  ]
  if (profile === 'amll') {
    attributes.push(['xmlns:amll', NAMESPACE_AMLL])
  }
  attributes.push(...renderLanguage(lyric.meta?.language), ['itunes:timing', lyric.timing === Timing.WORD ? TIMING_WORD : TIMING_LINE])

  return attributes
}

/**
 * Generates one TTML document, retaining the source profile unless explicitly overridden.
 *
 * Offsets are baked into timestamps; a negative result or a missing required time throws.
 * Profile mappings retain the lead agent and first AMLL ruby, omitting unsupported fields and instrumental nodes.
 */
export const generateTtml = (lyric: runtime.Lyric, options: TtmlGenerateOptions = {}): TtmlGenerateResult => {
  if (lyric.timing !== Timing.LINE && lyric.timing !== Timing.WORD) {
    throw new Error('TTML generation requires line or word timing')
  }

  const resolved = resolveOptions(lyric, options)
  const lines = lyric.lines.filter((line) => {
    return line.type !== LineType.INSTRUMENTAL
  })
  const context = makeContext(lyric, lines, resolved.profile)
  const metadata = renderMetadata(lyric, lines, context, resolved.includeMeta)
  const paragraphs = lines.map((line) => {
    return renderLine(line, context)
  })

  const root = createXmlElement('tt', renderRootAttributes(lyric, resolved.profile), [
    createXmlElement('head', [], [metadata]),
    createXmlElement('body', [], [createXmlElement('div', [], paragraphs)]),
  ])

  return serializeXml(root, { indent: resolved.indent })
}
