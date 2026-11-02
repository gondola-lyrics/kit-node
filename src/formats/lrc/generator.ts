import type { runtime } from '@gondola-lyrics/model'
import type { LrcContent } from './common'

import { LineType, WordType, getAnnotationItemText, getContentText, resolveAnnotationTokenTime } from '@gondola-lyrics/model/runtime'

import { formatTime, getLineRomans, lowerTag } from '@root/utils'

export type LrcGenerateResult = LrcContent

export interface LrcGenerateOptions {
  /**
   * Word-level timestamp style; defaults to `angle`.
   *
   * `angle` is the enhanced LRC form and round-trips through this parser.
   *
   * `bracket` matches line timestamps, so this parser reads it as new lines rather than words.
   */
  wordTiming?: 'angle' | 'bracket' | 'none'
  /** Clock format for every timestamp; defaults to `mm:ss.SSS`. */
  timeFormat?: string
  /** Emit the metadata header; defaults to `true`. */
  includeMeta?: boolean
  /** Append the word duration to its tag, as in `<00:01.00,500>`. */
  includeWordEnd?: boolean
  /** Emit instrumental lines as a timestamp with no text; defaults to `true`. */
  includeInstrumental?: boolean
}

type LrcGenerateOptionsRequired = Required<LrcGenerateOptions>

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
  const duration = options.includeWordEnd && end !== undefined ? `,${Math.max(0, end - start)}` : ''

  return `${open}${formatTime(start, options.timeFormat)}${duration}${close}`
}

/**
 * Word-level lines interleave tags with their text; untimed words stay untagged.
 */
const renderSyllableText = (line: runtime.Line, options: LrcGenerateOptionsRequired) => {
  const content = line.content
  if (!content?.words.length) {
    return getContentText(content)
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
      const end = word.time?.end
      // Zero duration is open in LRC, so a closing boundary preserves a known zero range.
      const closing = options.wordTiming === 'angle' && options.includeWordEnd && end === start ? renderWordTag(end, undefined, options) : ''
      return `${renderWordTag(start, end, options)}${word.text}${closing}`
    })
    .join('')
}

const renderWordRomans = (line: runtime.Line, language: string | undefined, options: LrcGenerateOptionsRequired): string => {
  const pieces: { text: string; time: runtime.TimeRange | undefined }[] = []
  let spaced = false
  for (const word of line.content?.words ?? []) {
    if (word.type === WordType.SPACE) {
      spaced = true
      continue
    }
    const roman = word.annotation?.romans.find((item) => lowerTag(item.language) === language)
    if (roman === undefined || getAnnotationItemText(roman) === '') {
      continue
    }
    let prefix = pieces.length > 0 && spaced ? ' ' : ''
    spaced = false
    for (const token of roman.tokens) {
      if (token.text === '') {
        continue
      }
      pieces.push({ text: prefix + token.text, time: resolveAnnotationTokenTime(token, roman, word) })
      prefix = ''
    }
  }

  return pieces
    .map((piece, index) => {
      const start = piece.time?.start
      if (start === undefined) {
        return piece.text
      }
      const end = piece.time?.end
      const nextStart = pieces[index + 1]?.time?.start
      const needsClosing = end !== undefined && end !== nextStart && (!options.includeWordEnd || end === start)
      // Otherwise an open token could extend across words omitted from this romanization track.
      const closing = needsClosing ? renderWordTag(end, undefined, options) : ''
      return `${renderWordTag(start, end, options)}${piece.text}${closing}`
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

  const text = wordLevel && line.content?.words.length ? renderSyllableText(line, options) : getContentText(line.content)
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

const renderRomanRows = (lines: runtime.Line[], options: LrcGenerateOptionsRequired): string[] => {
  const rows: string[] = []
  for (const line of lines) {
    const start = line.time?.start
    if (start === undefined) {
      continue
    }
    const explicit = new Set((line.annotation?.romans ?? []).map((item) => lowerTag(item.language)))
    for (const item of getLineRomans(line)) {
      const language = lowerTag(item.language)
      const text = options.wordTiming === 'none' || explicit.has(language) ? item.text : renderWordRomans(line, language, options)
      rows.push(`${renderTimeTag(start, options)}${text}`)
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
 * Word romanizations retain token boundaries; explicit line romanizations take precedence for the same language.
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

  const romans = renderRomanRows(lyric.lines, resolved)
  if (romans.length) {
    result.romans = joinBlocks(header, romans)
  }

  return result
}
