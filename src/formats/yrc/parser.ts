import type { runtime } from '@gondola-lyrics/model'
import type { AnnotationTiming } from '@root/utils'
import type { LrcMetaTag } from '../lrc'
import type { ParseResult } from '../result'
import type { YrcContent } from './common'

import {
  LyricStatus,
  Timing,
  WordType,
  deriveLanguageUsages,
  isWordLevelLine,
  makeLineContentText,
  makeLineContentWords,
  makeLineInstrumental,
  makeLineNormal,
  makeLyric,
  makeTimeRange,
  makeUnknownEntry,
  makeWordNormal,
  makeWordSpace,
} from '@gondola-lyrics/model/runtime'

import { attachAnnotations, trimRuleWhitespace } from '@root/utils'

import { readLrc, readLrcMetaTags, scanWordTags } from '../lrc'
import { finalizeLyric } from '../result'
import { FORMAT, LINE_PATTERN, WORD_PATTERN, readYrcContent } from './common'

export type YrcParseInput = YrcContent

export interface YrcParseOptions {
  /**
   * Extra timestamp drift allowed after exact and source-precision matching, in milliseconds.
   * Tracks must share the original timeline; equal row counts never enable order matching.
   *
   * @default 0
   */
  annotationTolerance?: number
  /**
   * Maximum roman token drift outside a matched word, in milliseconds; matched boundaries are adjusted to that word.
   * Original word timing is preserved, and incomplete matches retain the whole line romanization.
   *
   * @default 0
   */
  wordAnnotationTolerance?: number
  /**
   * Recovers roman fragments from unique two-kana combination starts or equal-sized gaps between timing anchors.
   * Recovered token times are clipped to their original word; untimed fragments inherit its range.
   *
   * @default false
   */
  wordAnnotationFallback?: boolean
}

interface JsonLine {
  start: number
  text: string
  complete: boolean
  credit?: {
    raw: string
    names: string[]
  }
}

interface SourceLine {
  row: number
  line: runtime.Line
  display?: boolean
  credit?: boolean
}

const SEPARATORS = /^\p{White_Space}+$/u
const CREDIT_LABEL_PATTERN = /[:：]$/u

const isObject = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

const readCredit = (fragments: string[]): JsonLine['credit'] => {
  const label = trimRuleWhitespace(fragments[0] ?? '')
  const raw = trimRuleWhitespace(label.replace(CREDIT_LABEL_PATTERN, ''))
  if (!raw) {
    return undefined
  }

  const names = fragments.slice(1).join('').split('/').map(trimRuleWhitespace).filter(Boolean)
  return names.length ? { raw, names } : undefined
}

/**
 * Reads JSON display text and splits the joined credit content at slash separators.
 *
 * @returns A readable display line and whether all source fields are represented, or null for other JSON.
 */
export const readJsonLine = (text: string): JsonLine | null => {
  try {
    const value: unknown = JSON.parse(text)
    if (!isObject(value) || typeof value.t !== 'number' || !Number.isSafeInteger(value.t) || value.t < 0 || !Array.isArray(value.c)) {
      return null
    }

    const fragments: string[] = []
    let complete = Object.keys(value).every((key) => key === 't' || key === 'c')
    for (const fragment of value.c) {
      if (!isObject(fragment) || typeof fragment.tx !== 'string') {
        return null
      }
      fragments.push(fragment.tx)
      complete = complete && Object.keys(fragment).every((key) => key === 'tx')
    }

    const content = fragments.join('')
    return /[^\p{White_Space}]/u.test(content) ? { start: value.t, text: content, complete, credit: readCredit(fragments) } : null
  } catch {
    return null
  }
}

const appendWords = (words: runtime.Word[], text: string, time?: runtime.TimeRange): void => {
  for (const fragment of text.split(/(\p{White_Space}+)/u)) {
    if (fragment) {
      words.push(SEPARATORS.test(fragment) ? makeWordSpace({ text: fragment }) : makeWordNormal({ text: fragment, time }))
    }
  }
}

const readLine = (body: string, start: number, duration: number): runtime.Line => {
  const time = makeTimeRange({ start, end: start + duration })
  const pieces = scanWordTags(body, WORD_PATTERN)
  if (!pieces.some((piece) => piece.tag !== undefined)) {
    return /[^\p{White_Space}]/u.test(body) ? makeLineNormal({ time, content: makeLineContentText(body) }) : makeLineInstrumental({ time })
  }

  const words: runtime.Word[] = []
  for (const piece of pieces) {
    if (piece.tag === undefined) {
      appendWords(words, piece.text)
      continue
    }
    // YRC starts are absolute; the third field has no verified meaning.
    const [wordStart, wordDuration] = piece.tag.split(',').map(Number)
    appendWords(words, piece.text, makeTimeRange({ start: wordStart!, end: wordStart! + wordDuration! }))
  }

  return words.some((word) => word.type === WordType.NORMAL)
    ? makeLineNormal({ time, content: makeLineContentWords(words) })
    : makeLineInstrumental({ time })
}

const readTrack = (text: string, timings?: WeakMap<runtime.Line, AnnotationTiming>) => {
  const tags: { row: number; tag: LrcMetaTag; unknown?: boolean }[] = []

  const native: SourceLine[] = []
  const fallback: string[] = []

  const displays: SourceLine[] = []

  const rows = /^\s*</.test(text) ? [] : text.replace(/^\uFEFF/, '').split(/\r\n?|\n/)

  for (const [row, raw] of rows.entries()) {
    const line = raw.trimStart()
    const header = LINE_PATTERN.exec(line)
    if (header) {
      native.push({ row, line: readLine(line.slice(header[0].length), Number(header[1]), Number(header[2])) })
      fallback.push('')
    } else if (line.startsWith('{')) {
      const display = readJsonLine(line)
      if (display) {
        displays.push({
          row,
          display: true,
          credit: !!display.credit,
          line: makeLineNormal({ time: makeTimeRange({ start: display.start }), content: makeLineContentText(display.text) }),
        })
        if (display.credit) {
          const { raw, names } = display.credit
          for (const value of names) {
            tags.push({ row, unknown: true, tag: { key: raw, value } })
          }
        }
      }
      if (!display?.complete) {
        tags.push({ row, unknown: true, tag: { key: 'yrc:json', value: raw } })
      }
      fallback.push(display ? `[${display.start}ms]` : '')
    } else {
      fallback.push(raw)
    }
  }

  const clock: SourceLine[] = []
  const displayRows = new Set(displays.map((entry) => entry.row))
  readLrc(fallback.join('\n'), {
    onLine: (line, timing, row) => {
      // Display timestamps close preceding LRC segments, but their text never passes through the LRC grammar.
      if (displayRows.has(row)) {
        return
      }
      clock.push({ row, line })
      timings?.set(line, timing)
    },
    onMeta: (tag, row) => {
      tags.push({ row, tag })
    },
  })

  const entries = [...displays, ...(native.length ? native : clock)].sort((first, second) => first.row - second.row)
  for (const [index, entry] of entries.entries()) {
    if (!entry.display) {
      continue
    }
    // Only display rows lack an explicit end; a nondecreasing source successor can bound them.
    const next = entries[index + 1]?.line.time?.start
    if (next !== undefined && next >= entry.line.time!.start) {
      entry.line.time!.end = next
    }
  }

  const metaTags = tags.sort((first, second) => first.row - second.row)
  // Credit timestamps still bound preceding rows before their display content leaves the lyric stream.
  return { entries: entries.filter((entry) => !entry.credit), metaTags }
}

const readAnnotations = (text: string | undefined, timings: WeakMap<runtime.Line, AnnotationTiming>): runtime.Line[] => {
  return text
    ? readTrack(text, timings)
        .entries.filter((entry) => !entry.display)
        .map((entry) => entry.line)
    : []
}

/**
 * Parses native YRC or LRC fallback, keeping JSON display rows separate from annotation matching.
 * Explicit line and word durations remain unchanged, including zero durations and source timing violations.
 * JSON credit content becomes separate plain-text unknown entries sharing the source label and is omitted from lyric lines.
 *
 * @param input Plaintext tracks on the same timeline: yrc with ytlrc/yromalrc, or lrc with tlyric/romalrc.
 * @param options Independent line and word tolerances, with optional local roman recovery.
 *
 * @returns Canonical lyrics and model diagnostics; no readable timed rows yields INVALID status.
 */
export const parseYrc = (input: string | YrcParseInput, options: YrcParseOptions = {}): ParseResult => {
  const source = readYrcContent(input)
  if (!source) {
    return finalizeLyric(makeLyric({ format: FORMAT, status: LyricStatus.INVALID }))
  }

  const parsed = readTrack(source.original)
  const meta = readLrcMetaTags(parsed.metaTags.filter((entry) => !entry.unknown).map((entry) => entry.tag))
  let unknownIndex = 0
  // Standard mapping retains unknown tag order; merge literal JSON fields without interpreting reserved metadata keys.
  meta.unknowns = parsed.metaTags.flatMap(({ tag, unknown }) => {
    if (unknown) {
      return [makeUnknownEntry(tag)]
    }
    const entry = meta.unknowns[unknownIndex]
    if (entry?.key === tag.key && entry.value === tag.value) {
      unknownIndex += 1
      return [entry]
    }
    return []
  })

  const body = parsed.entries.filter((entry) => !entry.display).map((entry) => entry.line)
  const timings = new WeakMap<runtime.Line, AnnotationTiming>()
  const annotated = attachAnnotations(
    body,
    { translations: readAnnotations(source.translations, timings), romans: readAnnotations(source.romans, timings) },
    {
      preservePlaceholders: true,
      tolerance: options.annotationTolerance,
      wordTolerance: options.wordAnnotationTolerance,
      wordFallback: options.wordAnnotationFallback,
      getTiming: (line) => timings.get(line),
    },
  )

  let index = 0
  const lines = parsed.entries.map((entry) => {
    return entry.display ? entry.line : annotated[index++]!
  })

  return finalizeLyric(
    makeLyric({
      format: FORMAT,
      status: lines.length ? LyricStatus.VALID : LyricStatus.INVALID,
      timing: lines.some(isWordLevelLine) ? Timing.WORD : Timing.LINE,
      meta,
      lines,
      languages: deriveLanguageUsages(lines),
    }),
  )
}
