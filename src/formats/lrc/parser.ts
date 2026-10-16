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

/**
 * Sorts one group of tags into a timed line or a meta pair, the group sharing the text that stands after it.
 */
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
 * Reads the source into the timed lines and meta pairs it states.
 * A tag with no text after it is stacked with the tag that follows, as `[00:10][00:20]twice` states one stretch of text at two times.
 * Text standing before a line's first tag belongs to no tag, so it is dropped rather than guessed at.
 * A carriage return is a line ending rather than content, so a `\r\n` source reads the same as one written with `\n`.
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

    // A group left over is a run of tags the line ends with, so they share no text.
    readGroup(group, '', timed, meta)
  }

  return { timed, meta }
}

/**
 * Fills a lyric's meta from the tags gathered across the file.
 * A tag whose key no field claims is kept verbatim in `unknowns`, since a round trip loses nothing; a value the schema would reject is the model's to report.
 */
const readMetaTags = (tags: MetaTag[]) => {
  const meta = makeMeta()

  for (const tag of tags) {
    switch (tag.key) {
      case 'length':
      case 'duration': {
        // A duration is written as a time or as a bare count of milliseconds, so both are read.
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
 * Reads the words a line decomposes into, each carrying the range stated before it.
 * A tag times the word that follows it, and a run of whitespace becomes one space word however wide it is written.
 * A word left without a time is left without one: a word-level line asks every sung word for a range, and reporting a word that states none is the model's to do.
 */
const readWords = (text: string, lineStart: number) => {
  const words: runtime.Word[] = []

  /** Whether whitespace was crossed since the last word, so the next one needs a separator before it. */
  let pending = false

  for (const piece of splitWordTags(text)) {
    for (const [index, run] of piece.text.split(/\s+/).entries()) {
      if (!run) {
        pending = true
        continue
      }

      // The tag times the word it opens; a run after a space within the same piece carries no tag.
      const tag = index === 0 ? piece.tag : undefined

      // Whitespace only separates when a word stands on the other side of it.
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

/**
 * Builds a line from its text, in the shape its own tags state: the words they time each one, or the whole text otherwise.
 * A line's end is where the next one begins, since the format states only where each line starts.
 */
const readLine = (text: string, start: number, end: number | undefined) => {
  const time = makeTimeRange({ start, end })
  const content = isWordTimed(text) ? makeLineContentWords(readWords(text, start)) : makeLineContentText(text.trim())

  return makeLineNormal({ time, content })
}

/**
 * Reads LRC text into a runtime lyric, keeping the lines in the order the file wrote them.
 * Nothing the text got wrong is judged here: a line out of order, a line carrying no text and a word carrying no time all reach the tree as written, for the model's `validateLyric` to report.
 * Text carrying no time this format can read still yields a lyric, marked `INVALID`, since a text handed to this reader is one it was asked to read.
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
    const end = next !== undefined && next >= item.start ? next : undefined

    lines.push(readLine(item.text, item.start, end))
  }

  // A line carrying words is what makes the lyric word-timed.
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
