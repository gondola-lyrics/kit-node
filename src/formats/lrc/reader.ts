import type { runtime } from '@gondola-lyrics/model'
import type { WordPiece } from './utils'

import {
  makeLineContentText,
  makeLineContentWords,
  makeLineInstrumental,
  makeLineNormal,
  makeTimeRange,
  makeWordNormal,
  makeWordSpace,
} from '@gondola-lyrics/model/runtime'

import { isTime, parseTime } from '@root/utils'

import { META_PATTERN, TAG_PATTERN, parseWordTime, splitWordTags } from './utils'

interface TimedLine {
  text: string
  start: number
  tag: string
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
   * Reports each line with its source precision before normalization can change its identity or order.
   */
  onLine?: (line: runtime.Line, timing: LrcLineTiming) => void
}

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

const readGroup = (tags: string[], text: string, timed: TimedLine[], meta: LrcMetaTag[]) => {
  for (const tag of tags) {
    const start = isTime(tag) ? parseTime(tag) : undefined
    if (start !== undefined) {
      timed.push({ text, start, tag })
      continue
    }

    const pair = readMeta(tag)
    if (pair) {
      meta.push(pair)
    }
  }
}

/**
 * Stacked timestamps share the following text, as in `[00:10][00:20]twice`.
 * Text before the first tag is discarded because it has no timing association.
 */
const readTimedLines = (text: string) => {
  const timed: TimedLine[] = []
  const meta: LrcMetaTag[] = []

  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
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

      readGroup(group, shared, timed, meta)
      group = []
    }

    // Trailing timestamps still represent empty timed lines.
    readGroup(group, '', timed, meta)
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
    options.onLine?.(line, readLineTiming(item.tag))
  }

  return lines
}

/**
 * Reads one LRC track before normalization so consumers retain source order and timing slots.
 * The caller owns metadata mapping, annotation attachment, and final normalization.
 *
 * @param text Original lyrics or one auxiliary track in LRC syntax.
 * @param options Optional observer for source timestamp information.
 *
 * @returns Model lines in input order and metadata tags with lowercase keys and trimmed values.
 */
export const readLrc = (text: string, options: LrcReadOptions = {}): LrcReadResult => {
  const { timed, meta } = readTimedLines(text)
  return { lines: readLines(timed, options), metaTags: meta }
}
