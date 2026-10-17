import type { runtime } from '@gondola-lyrics/model'

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
  deriveLanguageUsages,
} from '@gondola-lyrics/model/runtime'

import { META_PATTERN, TAG_PATTERN, isBlank, makeSpace, makeWord, parseWordTime, splitWordTags } from './utils'
import { isTime, parseTime } from '@root/utils'

const FORMAT = 'lrc'

const BARE_NUMBER_PATTERN = /^\d+$/

interface TimedLine {
  text: string
  start: number
}

interface MetaTag {
  key: string
  value: string
}

const isBareNumber = (value: string) => {
  return BARE_NUMBER_PATTERN.test(value.trim())
}

const isWordTimed = (text: string) => {
  return splitWordTags(text).some((piece) => piece.tag !== undefined && !isBlank(piece.text))
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

  for (const raw of text.replaceAll('\r\n', '\n').split('\n')) {
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
 * Whitespace becomes a single separator only between words.
 * Untimed words remain untimed for model validation rather than receiving inferred timestamps.
 */
const readWords = (text: string, lineStart: number) => {
  const words: runtime.Word[] = []

  let pending = false

  for (const piece of splitWordTags(text)) {
    for (const [index, run] of piece.text.split(/\s+/).entries()) {
      if (!run) {
        pending = true
        continue
      }

      // A tag applies only to its immediate run, not later words in the same piece.
      const tag = index === 0 ? piece.tag : undefined

      if (pending && words.length) {
        words.push(makeSpace())
      }

      const time = tag === undefined ? undefined : parseWordTime(tag, lineStart)
      words.push(makeWord(run, time?.start, time?.end))
      pending = false
    }
  }

  return words
}

const readLine = (text: string, start: number, end: number | undefined) => {
  const time = makeTimeRange({ start, end })
  const content = isWordTimed(text) ? makeLineContentWords(readWords(text, start)) : makeLineContentText(text.trim())

  return makeLineNormal({ time, content })
}

/**
 * Source order, empty timed lines, and missing word times are preserved for model validation.
 *
 * `INVALID` means no readable timed lines; `VALID` does not imply model validation has passed.
 */
export const parseLrc = (text: string): runtime.Lyric => {
  const { timed, meta } = readTimedLines(text)
  const metaTags = readMetaTags(meta)

  if (!timed.length) {
    return makeLyric({ format: FORMAT, status: LyricStatus.INVALID, meta: metaTags })
  }

  const lines: runtime.Line[] = []

  for (const [index, item] of timed.entries()) {
    const next = timed[index + 1]?.start
    // LRC has no line ends; only a nondecreasing next timestamp can supply one.
    const end = next !== undefined && next >= item.start ? next : undefined

    lines.push(readLine(item.text, item.start, end))
  }

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
