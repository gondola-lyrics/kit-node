import type { runtime } from '@gondola-lyrics/model'
import type { ParseResult } from '../result'
import type { LrcContent } from './common'
import type { WordPiece } from './utils'

import {
  LyricStatus,
  Timing,
  deriveLanguageUsages,
  makeLineContentText,
  makeLineContentWords,
  makeLineInstrumental,
  makeLineNormal,
  makeLyric,
  makeMeta,
  makeText,
  makeTimeRange,
  makeUnknownEntry,
  makeWordNormal,
  makeWordSpace,
} from '@gondola-lyrics/model/runtime'

import { attachAnnotations, isTime, parseTime } from '@root/utils'

import { finalizeLyric } from '../result'
import { FORMAT, readLrcContent } from './common'
import { META_PATTERN, TAG_PATTERN, parseWordTime, splitWordTags } from './utils'

interface TimedLine {
  text: string
  start: number
  tag: string
  row: number
}

export interface LrcMetaTag {
  key: string
  value: string
}

export interface LrcReadResult {
  lines: runtime.Line[]
  metaTags: LrcMetaTag[]
}

export interface LrcLineTiming {
  /**
   * Clock timestamp precision in milliseconds; unit-suffixed timestamps use 1ms.
   */
  precision: number
}

export interface LrcReadOptions {
  /**
   * Reports each line with its source precision and zero-based physical row before normalization changes its identity or order.
   */
  onLine?: (line: runtime.Line, timing: LrcLineTiming, row: number) => void
  /**
   * Reports metadata with its zero-based physical row so container fields can preserve their relative order.
   */
  onMeta?: (tag: LrcMetaTag, row: number) => void
}

export interface LrcParseOptions {
  /**
   * How far an annotation's timestamp may sit from a line's start, in milliseconds.
   * Defaults to `0`, which requires an exact match.
   */
  annotationTolerance?: number
  /**
   * Maximum roman token drift outside a matched word, in milliseconds; matched boundaries are adjusted to that word.
   * Original word timing is preserved, and incomplete word matches retain the source line romanization.
   *
   * @default 0
   */
  wordAnnotationTolerance?: number
  /**
   * Recovers unmatched roman fragments from unique two-kana combination starts or equal-sized gaps between timing anchors.
   * Only a base kana followed by its small kana combines; doubled consonants and long vowels retain the whole line romanization.
   * Recovered token times are clipped to their original word; untimed fragments inherit its range.
   *
   * @default false
   */
  wordAnnotationFallback?: boolean
}

export type LrcParseInput = LrcContent

const CLOCK_PATTERN = /^(?:\d+:){0,2}\d+(?:\.(\d+))?$/

const readLineTiming = (tag: string): LrcLineTiming => {
  const clock = CLOCK_PATTERN.exec(tag.trim())
  return { precision: clock ? 10 ** Math.max(0, 3 - (clock[1]?.length ?? 0)) : 1 }
}

const readMeta = (body: string) => {
  const match = META_PATTERN.exec(body)
  if (!match) {
    return undefined
  }

  return { key: (match[1] ?? '').toLowerCase(), value: (match[2] ?? '').trim() }
}

const readGroup = (tags: string[], text: string, row: number, timed: TimedLine[], meta: LrcMetaTag[], options: LrcReadOptions) => {
  for (const tag of tags) {
    const start = isTime(tag) ? parseTime(tag) : undefined
    if (start !== undefined) {
      timed.push({ text, start, tag, row })
      continue
    }

    const pair = readMeta(tag)
    if (pair) {
      meta.push(pair)
      options.onMeta?.(pair, row)
    }
  }
}

/**
 * Stacked timestamps share the following text, as in `[00:10][00:20]twice`.
 * Text before the first tag is discarded because it has no timing association.
 */
const readTimedLines = (text: string, options: LrcReadOptions) => {
  const timed: TimedLine[] = []
  const meta: LrcMetaTag[] = []

  for (const [row, raw] of text.replace(/\r\n?/g, '\n').split('\n').entries()) {
    const line = raw.trim()
    if (!line) {
      continue
    }

    const matches = [...line.matchAll(TAG_PATTERN)]
    let group: string[] = []

    for (const [index, match] of matches.entries()) {
      const at = match.index + match[0].length
      const next = matches[index + 1]?.index ?? line.length
      const shared = line.slice(at, next)

      group.push(match[1] ?? '')

      if (!shared.trim()) {
        continue
      }

      readGroup(group, shared, row, timed, meta, options)
      group = []
    }

    // Trailing timestamps still represent empty timed lines.
    readGroup(group, '', row, timed, meta, options)
  }

  return { timed, meta }
}

/**
 * Whitespace becomes a space word preserving the source run, as in `lo      World`.
 * A tag opens a segment; untagged words continue from the previous end so the timeline has no holes.
 * Explicit word ends are kept as written, so duration tags survive unchanged.
 */
const readWords = (pieces: WordPiece[], lineStart: number) => {
  const drafts: { text: string; start?: number; end?: number; space?: boolean }[] = []
  const open = new Set<{ start?: number; end?: number }>()

  const closeSegment = (boundary: number | undefined) => {
    if (boundary === undefined) {
      return
    }
    for (const draft of open) {
      if (draft.start !== undefined && draft.end === undefined && boundary >= draft.start) {
        draft.end = boundary
      }
    }
    open.clear()
  }

  let segmentStart: number | undefined = lineStart
  let cursor: number | undefined = lineStart

  for (const piece of pieces) {
    const time = piece.tag ? parseWordTime(piece.tag, lineStart) : undefined

    // A tag, even without following text, closes the segment it opens.
    if (time) {
      closeSegment(time.start)
      segmentStart = time.start
      cursor = time.start
    }

    if (!piece.text) {
      continue
    }

    let applied = false

    for (const run of piece.text.split(/(\s+)/)) {
      if (!run) {
        continue
      }

      // A separator keeps its own text and never carries a tag.
      if (!run.trim()) {
        if (drafts.length) {
          drafts.push({ text: run, space: true })
        }
        continue
      }

      const tagged = !applied && !!time
      applied = true

      const start = tagged ? segmentStart : cursor
      const end = tagged ? time?.end : undefined
      const draft = { text: run, start, end }

      drafts.push(draft)
      if (end !== undefined) {
        cursor = end
      } else {
        open.add(draft)
      }
    }
  }

  return { drafts, closeSegment }
}

/**
 * Explicit word ranges can extend past the next line's start, so the inferred end covers both.
 * A trailing open segment uses that end when it is known.
 */
const readLine = (text: string, start: number, nextStart: number | undefined) => {
  const trimmed = text.trim()
  let end = nextStart !== undefined && nextStart >= start ? nextStart : undefined
  if (!trimmed) {
    return makeLineInstrumental({ time: makeTimeRange({ start, end }) })
  }

  const pieces = splitWordTags(text)
  const wordTimed = pieces.some((piece) => !!piece.tag)
  const { drafts, closeSegment } = wordTimed ? readWords(pieces, start) : { drafts: [], closeSegment: () => {} }

  // Without a later line, a final word carrying its own end bounds the line; otherwise it stays open.
  if (end === undefined) {
    const last = [...drafts].reverse().find((draft) => !draft.space && draft.start !== undefined)
    end = last?.end
  }

  if (end !== undefined) {
    for (const draft of drafts) {
      if (draft.end !== undefined) {
        end = Math.max(end, draft.end)
      }
    }
  }

  // Earlier segments were closed by their next tag, so this only closes the final one.
  closeSegment(end)

  const words = drafts.map((draft) => {
    if (draft.space) {
      return makeWordSpace({ text: draft.text })
    }
    // A missing start omits the range instead of inventing a word timestamp.
    const time = draft.start === undefined ? undefined : makeTimeRange({ start: draft.start, end: draft.end })
    return makeWordNormal({ text: draft.text, time })
  })

  const time = makeTimeRange({ start, end })
  const content = wordTimed ? makeLineContentWords(words) : makeLineContentText(trimmed)

  return makeLineNormal({ time, content })
}

/**
 * Builds one line per timed row, so an annotation track reuses the original text's reading unchanged.
 * Empty timed rows become instrumental lines bounded by the next timestamp when one is usable.
 */
const readLines = (timed: TimedLine[], options: LrcReadOptions): runtime.Line[] => {
  const lines: runtime.Line[] = []

  for (const [index, item] of timed.entries()) {
    const next = timed[index + 1]?.start
    // LRC has no line ends; only a nondecreasing next timestamp can supply one.
    const line = readLine(item.text, item.start, next)
    lines.push(line)
    options.onLine?.(line, readLineTiming(item.tag), item.row)
  }

  return lines
}

/**
 * Reads one LRC track in source order and performs no other operation: no metadata mapping, annotation attachment, sorting, or normalization.
 *
 * @param text Original lyrics or one auxiliary track in LRC syntax.
 * @param options Optional observer for source timestamp information.
 *
 * @returns Model lines in input order and metadata tags with lowercase keys and trimmed values.
 */
export const readLrc = (text: string, options: LrcReadOptions = {}): LrcReadResult => {
  const { timed, meta } = readTimedLines(text, options)
  return { lines: readLines(timed, options), metaTags: meta }
}

const isBareNumber = (value: string) => {
  return /^\d+$/.test(value.trim())
}

/**
 * Maps standard lyric metadata while preserving unmapped tags and unparseable durations in unknowns.
 *
 * @param tags Reader tags with lowercase keys and trimmed values.
 *
 * @returns Model metadata without interpreting platform-specific embedded annotations.
 */
export const readLrcMetaTags = (tags: LrcMetaTag[]) => {
  const meta = makeMeta()

  for (const tag of tags) {
    switch (tag.key) {
      case 'length':
      case 'duration': {
        // Duration tags accept both clock notation and integer milliseconds.
        const duration = parseTime(tag.value) ?? (isBareNumber(tag.value) ? Number(tag.value) : Number.NaN)
        if (Number.isFinite(duration)) {
          meta.duration = Math.trunc(duration)
        } else {
          meta.unknowns.push(makeUnknownEntry({ key: tag.key, value: tag.value }))
        }
        break
      }
      case 'offset':
        meta.offset = Math.trunc(Number(tag.value)) || 0
        break
      case 'ti':
      case 'title':
        meta.titles.push(makeText({ text: tag.value }))
        break
      case 'ar':
      case 'artist':
        meta.artists.push(makeText({ text: tag.value }))
        break
      case 'al':
      case 'album':
        meta.albums.push(makeText({ text: tag.value }))
        break
      case 'by':
      case 'author':
        meta.authors.push(makeText({ text: tag.value }))
        break
      case 'isrc':
        meta.isrcs.push(tag.value)
        break
      default:
        meta.unknowns.push(makeUnknownEntry({ key: tag.key, value: tag.value }))
        break
    }
  }

  return meta
}

const parseLrcText = (text: string): runtime.Lyric => {
  const { lines, metaTags } = readLrc(text)
  const meta = readLrcMetaTags(metaTags)

  if (!lines.length) {
    return makeLyric({ format: FORMAT, status: LyricStatus.INVALID, meta })
  }

  const wordTimed = lines.some((line) => (line.content?.words.length ?? 0) > 0)

  return makeLyric({
    format: FORMAT,
    status: LyricStatus.VALID,
    timing: wordTimed ? Timing.WORD : Timing.LINE,
    meta,
    languages: deriveLanguageUsages(lines),
    lines,
  })
}

/**
 * Empty timed rows become instrumental lines; source order and missing word times remain for model validation.
 *
 * Annotation tracks are read as lines too and attached by timestamp, and rows that match no line are dropped.
 * Complete roman tracks attach to words by timing and optional local recovery; other tracks retain their source line text.
 *
 * `INVALID` means no readable timed lines; the returned diagnostics carry whatever the canonical tree breaks.
 */
export const parseLrc = (input: string | LrcParseInput, options: LrcParseOptions = {}): ParseResult => {
  const source = readLrcContent(input) ?? { original: '' }
  const lyric = parseLrcText(source.original)

  if (lyric.status === LyricStatus.INVALID) {
    return finalizeLyric(lyric)
  }

  const translations = source.translations ? readLrc(source.translations).lines : []
  const romans = source.romans ? readLrc(source.romans).lines : []
  if (!translations.length && !romans.length) {
    return finalizeLyric(lyric)
  }

  const lines = attachAnnotations(
    lyric.lines,
    { translations, romans },
    {
      tolerance: options.annotationTolerance,
      wordTolerance: options.wordAnnotationTolerance,
      wordFallback: options.wordAnnotationFallback,
    },
  )

  return finalizeLyric({ ...lyric, lines })
}
