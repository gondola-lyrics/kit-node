import type { runtime } from '@gondola-lyrics/model'

import { LineType, WordType } from '@gondola-lyrics/model/runtime'

import { formatTime } from '@root/utils'

/**
 * How word-level timestamps are written.
 *
 * `angle` is the enhanced LRC form and round-trips through this parser.
 * `bracket` matches line timestamps, so this parser reads it as new lines rather than words.
 */
export type LrcWordTiming = 'angle' | 'bracket' | 'none'

export interface LrcGenerateOptions {
  /** Word-level timestamp style; defaults to `angle`. */
  wordTiming?: LrcWordTiming
  /** Clock format for every timestamp; defaults to `mm:ss.SSS`. */
  timeFormat?: string
  /** Emit the metadata header; defaults to `true`. */
  includeMeta?: boolean
  /** Append the word duration to its tag, as in `<00:01.00,500>`. */
  includeWordEnd?: boolean
  /** Emit instrumental lines as a timestamp with no text; defaults to `true`. */
  includeInstrumental?: boolean
}

export type LrcGenerateOptionsRequired = Required<LrcGenerateOptions>

/**
 * The generated LRC text and the annotations LRC keeps in separate files.
 */
export interface LrcGenerateResult {
  original: string
  translations?: string
  romans?: string
}

const resolveOptions = (options: LrcGenerateOptions = {}): LrcGenerateOptionsRequired => {
  return {
    wordTiming: options.wordTiming ?? 'angle',
    timeFormat: options.timeFormat ?? 'mm:ss.SSS',
    includeMeta: options.includeMeta ?? true,
    includeWordEnd: options.includeWordEnd ?? false,
    includeInstrumental: options.includeInstrumental ?? true,
  }
}

const renderTimeTag = (time: number, options: LrcGenerateOptionsRequired) => {
  return `[${formatTime(time, options.timeFormat)}]`
}

const renderWordTag = (start: number, end: number | undefined, options: LrcGenerateOptionsRequired) => {
  if (options.wordTiming === 'none') {
    return ''
  }

  const open = options.wordTiming === 'bracket' ? '[' : '<'
  const close = options.wordTiming === 'bracket' ? ']' : '>'
  // A duration of zero still states where the word stops, so it is written when the end is known.
  const duration = options.includeWordEnd && end !== undefined ? `,${Math.max(0, end - start)}` : ''

  return `${open}${formatTime(start, options.timeFormat)}${duration}${close}`
}

/**
 * Plain text joins words as written, including the separators stored as space words.
 */
const renderPlainText = (line: runtime.Line) => {
  const content = line.content
  if (!content) {
    return ''
  }
  if (content.text !== undefined) {
    return content.text
  }

  return content.words.map((word) => word.text).join('')
}

/**
 * Word-level lines interleave tags with their text; untimed words stay untagged.
 */
const renderSyllableText = (line: runtime.Line, options: LrcGenerateOptionsRequired) => {
  const content = line.content
  if (!content?.words.length) {
    return renderPlainText(line)
  }

  return content.words
    .map((word) => {
      if (word.type === WordType.SPACE) {
        return word.text
      }
      const start = word.time?.start
      if (start === undefined) {
        return word.text
      }
      return `${renderWordTag(start, word.time?.end, options)}${word.text}`
    })
    .join('')
}

const renderMetaRows = (meta: runtime.Meta, options: LrcGenerateOptionsRequired) => {
  const rows: string[] = []

  for (const title of meta.titles) {
    rows.push(`[ti:${title.text}]`)
  }
  for (const artist of meta.artists) {
    rows.push(`[ar:${artist.text}]`)
  }
  for (const album of meta.albums) {
    rows.push(`[al:${album.text}]`)
  }
  for (const author of meta.authors) {
    rows.push(`[by:${author.text}]`)
  }
  if (meta.offset) {
    rows.push(`[offset:${meta.offset}]`)
  }
  if (meta.duration !== undefined) {
    rows.push(`[length:${formatTime(meta.duration, options.timeFormat)}]`)
  }
  for (const isrc of meta.isrcs) {
    rows.push(`[isrc:${isrc}]`)
  }
  for (const unknown of meta.unknowns) {
    rows.push(`[${unknown.key}:${unknown.value}]`)
  }

  return rows
}

/**
 * Returns `undefined` for a line the options leave out, so callers can drop it rather than emit a blank row.
 */
const renderLineRow = (line: runtime.Line, options: LrcGenerateOptionsRequired, wordLevel: boolean) => {
  if (line.type === LineType.INSTRUMENTAL && !options.includeInstrumental) {
    return undefined
  }

  // An untimed lyric still needs a stamp, so it starts at zero like any other line.
  const time = renderTimeTag(line.time?.start ?? 0, options)

  // An instrumental line carries no content, so its timestamp alone marks the gap.
  if (line.type === LineType.INSTRUMENTAL) {
    return time
  }

  const text = wordLevel && line.content?.words.length ? renderSyllableText(line, options) : renderPlainText(line)
  return `${time}${text}`
}

const renderAnnotationRows = (lines: runtime.Line[], options: LrcGenerateOptionsRequired, pick: (line: runtime.Line) => { text: string }[]) => {
  const rows: string[] = []

  for (const line of lines) {
    const start = line.time?.start
    if (start === undefined) {
      continue
    }
    for (const item of pick(line)) {
      rows.push(`${renderTimeTag(start, options)}${item.text}`)
    }
  }

  return rows
}

const joinBlocks = (header: string[], body: string[]) => {
  const blocks: string[] = []
  if (header.length) {
    blocks.push(header.join('\n'))
  }
  if (body.length) {
    blocks.push(body.join('\n'))
  }

  return blocks.join('\n\n')
}

/**
 * Generates the LRC text plus the annotations a single file cannot hold.
 *
 * Word tags appear only for a word-timed lyric when `wordTiming` is not `none`; otherwise every line stays whole.
 */
export const generateLrc = (lyric: runtime.Lyric, options: LrcGenerateOptions = {}): LrcGenerateResult => {
  const resolved = resolveOptions(options)
  const header = resolved.includeMeta && lyric.meta ? renderMetaRows(lyric.meta, resolved) : []

  const hasWords = lyric.lines.some((line) => (line.content?.words.length ?? 0) > 0)
  const wordLevel = hasWords && resolved.wordTiming !== 'none'

  const body = lyric.lines
    .map((line) => {
      return renderLineRow(line, resolved, wordLevel)
    })
    .filter((row) => row !== undefined)

  const result: LrcGenerateResult = {
    original: joinBlocks(header, body),
  }

  const translations = renderAnnotationRows(lyric.lines, resolved, (line) => line.annotation?.translations ?? [])
  if (translations.length) {
    result.translations = joinBlocks(header, translations)
  }

  const romans = renderAnnotationRows(lyric.lines, resolved, (line) => line.annotation?.romans ?? [])
  if (romans.length) {
    result.romans = joinBlocks(header, romans)
  }

  return result
}
