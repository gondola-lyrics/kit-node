import type { runtime } from '@gondola-lyrics/model'
import type { ParseResult } from '../result'
import type { KwrcContent, SourceLine, WordScales } from './common'

import {
  LineType,
  LyricStatus,
  Timing,
  deriveLanguageUsages,
  isWordLevelLine,
  makeLineAnnotation,
  makeLineAnnotationTranslation,
  makeLineContentText,
  makeLineContentWords,
  makeLineInstrumental,
  makeLineNormal,
  makeLyric,
  makeTimeRange,
  makeWordNormal,
  makeWordSpace,
} from '@gondola-lyrics/model/runtime'

import { readLrc, readLrcMetaTags, scanWordTags, splitWordTags } from '../lrc'
import { finalizeLyric } from '../result'
import { FORMAT, VISIBLE_TEXT, WORD_PATTERN, hasKwrcTranslations, readKwrcContent, readKwrcScales, readKwrcSource, readText } from './common'

export type { KwrcContent as KwrcParseInput } from './common'

const SEPARATORS = /^\p{White_Space}+$/u

const readWordTime = (tag: string, lineStart: number, scales: WordScales): runtime.TimeRange | undefined => {
  const values = tag.split(',').map(Number)
  if (!Number.isSafeInteger(lineStart) || !values.every(Number.isSafeInteger)) {
    return undefined
  }

  // The optional third field has no verified timing meaning.
  const [x, y] = values as [number, number]
  const sum = x + y
  const difference = x - y
  if (!Number.isSafeInteger(sum) || !Number.isSafeInteger(difference) || sum % (2 * scales.start) !== 0 || difference % (2 * scales.duration) !== 0) {
    return undefined
  }

  const relativeStart = Math.abs(sum / (2 * scales.start))
  const duration = Math.abs(difference / (2 * scales.duration))
  const start = lineStart + relativeStart
  const end = start + duration
  if (![relativeStart, duration, start, end].every(Number.isSafeInteger)) {
    return undefined
  }

  return makeTimeRange({ start, end })
}

const readLine = ({ text, start }: SourceLine, nextStart: number | undefined, scales: WordScales | undefined): runtime.Line => {
  const boundary = nextStart !== undefined && nextStart >= start ? nextStart : undefined
  let end = boundary
  const pieces = scanWordTags(text, WORD_PATTERN)
  if (!pieces.some((piece) => piece.tag !== undefined)) {
    if (Number.isSafeInteger(start) && splitWordTags(text).some((piece) => piece.tag !== undefined)) {
      const suffix = end === undefined ? '' : `\n[${end}ms]`
      return readLrc(`[${start}ms]${text}${suffix}`).lines[0]!
    }
    const time = makeTimeRange({ start, end })
    return VISIBLE_TEXT.test(text) ? makeLineNormal({ time, content: makeLineContentText(text) }) : makeLineInstrumental({ time })
  }

  const words: runtime.Word[] = []
  for (const piece of pieces) {
    const time = piece.tag !== undefined && scales ? readWordTime(piece.tag, start, scales) : undefined
    if (piece.tag !== undefined && !time) {
      // Retaining the whole encoded row avoids presenting partially decoded or rounded timing as reliable.
      return makeLineNormal({
        time: makeTimeRange({ start, end: boundary }),
        content: makeLineContentText(text),
      })
    }
    if (time?.end !== undefined) {
      end = Math.max(end ?? start, time.end)
    }
    for (const fragment of piece.text.split(/(\p{White_Space}+)/u)) {
      if (fragment) {
        words.push(SEPARATORS.test(fragment) ? makeWordSpace({ text: fragment }) : makeWordNormal({ text: fragment, time }))
      }
    }
  }

  const time = makeTimeRange({ start, end })
  return VISIBLE_TEXT.test(readText(text)) ? makeLineNormal({ time, content: makeLineContentWords(words) }) : makeLineInstrumental({ time })
}

/**
 * Parses decoded KWRC with explicit word durations and structurally verified embedded translations.
 *
 * Missing or conflicting parameters and unsafe word calculations retain the complete row as line-level text.
 * Plain LRC remains readable; offset is stored as metadata without changing source timestamps.
 *
 * @param input Decoded plaintext or an object containing its original text.
 *
 * @returns Canonical lyrics and model diagnostics; no readable timed rows yields INVALID status.
 */
export const parseKwrc = (input: string | KwrcContent): ParseResult => {
  const source = readKwrcContent(input)
  if (!source) {
    return finalizeLyric(makeLyric({ format: FORMAT, status: LyricStatus.INVALID }))
  }

  const track = readKwrcSource(source.original)
  const bilingual = hasKwrcTranslations(track)
  const encoded = track.lines.some((line) => !!line.text.match(WORD_PATTERN))

  let lines: runtime.Line[]
  let tags = track.metaTags
  if (!encoded && !bilingual) {
    const fallback = readLrc(source.original)
    lines = fallback.lines
    tags = fallback.metaTags
  } else {
    const scales = readKwrcScales(tags)
    const originals = bilingual ? track.lines.filter((_, index) => index % 2 === 0) : track.lines
    lines = originals.map((original, index) => {
      const line = readLine(original, originals[index + 1]?.start, scales)
      const translation = bilingual ? readText(track.lines[index * 2 + 1]?.text ?? '') : ''
      if (VISIBLE_TEXT.test(translation)) {
        line.annotation = makeLineAnnotation({ translations: [makeLineAnnotationTranslation({ text: translation })] })
      }
      return line
    })
  }

  // A final empty slot already supplied the preceding line's boundary.
  const last = lines.at(-1)
  if (last?.type === LineType.INSTRUMENTAL && (last.time?.end === undefined || last.time.end === last.time.start)) {
    lines.pop()
  }

  return finalizeLyric(
    makeLyric({
      format: FORMAT,
      status: lines.length ? LyricStatus.VALID : LyricStatus.INVALID,
      timing: lines.some(isWordLevelLine) ? Timing.WORD : Timing.LINE,
      meta: readLrcMetaTags(tags),
      lines,
      languages: deriveLanguageUsages(lines),
    }),
  )
}
