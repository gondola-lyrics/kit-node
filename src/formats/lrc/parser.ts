import type { runtime } from '@gondola-lyrics/model'
import type { ParseResult } from '../result'
import type { LrcContent } from './common'

import {
  Timing,
  LyricStatus,
  makeLineContentText,
  makeLineContentWords,
  makeLineNormal,
  makeLyric,
  makeTimeRange,
  makeMeta,
  makeText,
  makeUnknownEntry,
  makeWordNormal,
  makeWordSpace,
  deriveLanguageUsages,
} from '@gondola-lyrics/model/runtime'

import { attachLineAnnotations, isTime, parseTime } from '@root/utils'

import { finalizeLyric } from '../result'
import { FORMAT, readLrcContent } from './common'
import { META_PATTERN, TAG_PATTERN, parseWordTime, splitWordTags } from './utils'

export interface LrcParseOptions {
  /**
   * How far an annotation's timestamp may sit from a line's start, in milliseconds.
   * Defaults to `0`, which requires an exact match.
   */
  annotationTolerance?: number
}

export type LrcParseInput = LrcContent

interface TimedLine {
  text: string
  start: number
}

interface MetaTag {
  key: string
  value: string
}

const isBareNumber = (value: string) => {
  return /^\d+$/.test(value.trim())
}

/**
 * A trailing tag alone still makes the line word-level, so it can close the last word.
 * Unreadable angle-bracket text stays plain lyric content.
 */
const isWordTimed = (text: string) => {
  return splitWordTags(text).some((piece) => piece.tag !== undefined && parseWordTime(piece.tag, 0) !== undefined)
}

const readMeta = (body: string) => {
  const match = META_PATTERN.exec(body)
  if (!match) {
    return undefined
  }

  return { key: (match[1] ?? '').toLowerCase(), value: (match[2] ?? '').trim() }
}

const readGroup = (tags: string[], text: string, timed: TimedLine[], meta: MetaTag[]) => {
  for (const tag of tags) {
    const start = isTime(tag) ? parseTime(tag) : undefined
    if (start !== undefined) {
      timed.push({ text, start })
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
  const meta: MetaTag[] = []

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
 * Unmapped tags and unparseable durations remain in `unknowns` to avoid discarding metadata.
 * Keys are lowercased and values trimmed, so original tag spelling is not preserved.
 */
const readMetaTags = (tags: MetaTag[]) => {
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

/**
 * Whitespace becomes a space word preserving the source run, as in `lo      World`.
 * A tag opens a segment; untagged words continue from the previous end so the timeline has no holes.
 * Explicit word ends are kept as written, so duration tags survive unchanged.
 */
const readWords = (text: string, lineStart: number) => {
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

  for (const piece of splitWordTags(text)) {
    const time = piece.tag === undefined ? undefined : parseWordTime(piece.tag, lineStart)

    // A tag, even without following text, closes the segment it opens.
    if (time?.start !== undefined) {
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

      const tagged = !applied && time?.start !== undefined
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
 * A line ends at the next line's start; without one, it ends at its final word's end.
 * An open word is closed by the next timed word, or by the line end, so every sung word stays inside the line.
 */
const readLine = (text: string, start: number, nextStart: number | undefined) => {
  const wordTimed = isWordTimed(text)
  const { drafts, closeSegment } = wordTimed ? readWords(text, start) : { drafts: [], closeSegment: () => {} }

  let end = nextStart !== undefined && nextStart >= start ? nextStart : undefined

  // Without a later line, a final word carrying its own end bounds the line; otherwise it stays open.
  if (end === undefined) {
    const last = [...drafts].reverse().find((draft) => !draft.space && draft.start !== undefined)
    end = last?.end
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
  const content = wordTimed ? makeLineContentWords(words) : makeLineContentText(text.trim())

  return makeLineNormal({ time, content })
}

/**
 * Builds one line per timed row, so an annotation track reuses the original text's reading unchanged.
 * An empty timed row still yields a line, since it marks a gap rather than a parse failure.
 */
const readLines = (timed: TimedLine[]): runtime.Line[] => {
  const lines: runtime.Line[] = []

  for (const [index, item] of timed.entries()) {
    const next = timed[index + 1]?.start
    // LRC has no line ends; only a nondecreasing next timestamp can supply one.
    lines.push(readLine(item.text, item.start, next))
  }

  return lines
}

const parseLrcText = (text: string): runtime.Lyric => {
  const { timed, meta } = readTimedLines(text)
  const metaTags = readMetaTags(meta)

  if (!timed.length) {
    return makeLyric({ format: FORMAT, status: LyricStatus.INVALID, meta: metaTags })
  }

  const lines = readLines(timed)
  const wordTimed = lines.some((line) => (line.content?.words.length ?? 0) > 0)

  return makeLyric({
    format: FORMAT,
    status: LyricStatus.VALID,
    timing: wordTimed ? Timing.WORD : Timing.LINE,
    meta: metaTags,
    languages: deriveLanguageUsages(lines),
    lines,
  })
}

/**
 * Source order, empty timed lines, and missing word times are preserved for model validation.
 *
 * Annotation tracks are read as lines too and attached by timestamp, and rows that match no line are dropped.
 *
 * `INVALID` means no readable timed lines; the returned diagnostics carry whatever the canonical tree breaks.
 */
export const parseLrc = (input: string | LrcParseInput, options: LrcParseOptions = {}): ParseResult => {
  const source = readLrcContent(input) ?? { original: '' }
  const lyric = parseLrcText(source.original)

  if (lyric.status === LyricStatus.INVALID) {
    return finalizeLyric(lyric)
  }

  const translations = source.translations === undefined ? [] : readLines(readTimedLines(source.translations).timed)
  const romans = source.romans === undefined ? [] : readLines(readTimedLines(source.romans).timed)
  if (translations.length === 0 && romans.length === 0) {
    return finalizeLyric(lyric)
  }

  const lines = attachLineAnnotations(lyric.lines, { translations, romans }, { tolerance: options.annotationTolerance })

  return finalizeLyric({ ...lyric, lines })
}
