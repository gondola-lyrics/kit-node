import type { runtime } from '@gondola-lyrics/model'
import type { AnnotationTiming } from '@root/utils'
import type { ParseResult } from '../result'
import type { QrcContent } from './common'

import {
  LineType,
  LyricStatus,
  Timing,
  WordType,
  deriveLanguageUsages,
  getContentText,
  getWordsText,
  isWordLevelLine,
  makeLineContentText,
  makeLineContentWords,
  makeLineInstrumental,
  makeLineNormal,
  makeLyric,
  makeMeta,
  makeText,
  makeTimeRange,
  makeUnknownEntry,
  makeWordAnnotation,
  makeWordAnnotationRuby,
  makeWordAnnotationToken,
  makeWordNormal,
  makeWordSpace,
} from '@gondola-lyrics/model/runtime'

import { attachAnnotations, isTime, mapShared, parseTime } from '@root/utils'

import { readLrc } from '../lrc'
import { finalizeLyric } from '../result'
import { FORMAT, LINE_PATTERN, readContent, readText } from './common'

export interface QrcParseOptions {
  /**
   * Extra tolerance in milliseconds for line annotations left after exact time and row order matching.
   *
   * @default 0
   */
  annotationTolerance?: number
  /**
   * Extra word-boundary tolerance in milliseconds; native QRC tracks allow at least 1ms for rounding.
   * LRC auxiliary tracks use exact word boundaries by default, and incomplete matches retain the whole line romanization.
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

export type QrcParseInput = QrcContent

/**
 * One reading and the length of the source word it covers, in Unicode code points.
 */
export interface RubySource {
  length: number
  ruby: runtime.WordAnnotationRuby
}

interface RubyWord {
  word: runtime.Word
  length: number
  byOrder: boolean
}

const WORD_PATTERN = /\((\d+),(\d+)\)/g
const META_PATTERN = /^([A-Za-z0-9_-]+)\s*:\s*([\s\S]*)$/
const META_TAG_PATTERN = /\[([^\]]*)\]/g
const RUBY_PATTERN = /\((\d+),(\d+)\)|(\d+)|([^0-9()]+)/gy
const RUBY_WORD_PATTERN = /[\p{Script=Han}\p{Number}]/u
const SEPARATORS = /^\p{White_Space}+$/u
const NATIVE_ANNOTATION_TIMING: AnnotationTiming = { precision: 1, rounding: 1 }

/**
 * Reads coverage markers and optional absolute token times without interpreting timing digits as coverage.
 *
 * @returns Complete ruby sources, or undefined when any source cannot be read.
 */
export const readRubyEntries = (value: string): RubySource[] | undefined => {
  const entries: RubySource[] = []
  let length = 0
  let tokens: runtime.WordAnnotationToken[] = []
  let text = ''
  let cursor = 0
  const finish = (): boolean => {
    if (text.trim()) {
      tokens.push(makeWordAnnotationToken({ text }))
    }
    if (!length || !tokens.length) {
      return false
    }
    entries.push({ length, ruby: makeWordAnnotationRuby({ tokens }) })
    tokens = []
    text = ''
    return true
  }

  // Consume timing parentheses as one token so their digits cannot become coverage markers.
  for (const match of value.matchAll(RUBY_PATTERN)) {
    cursor = match.index + match[0].length
    if (match[3]) {
      if (length && !finish()) {
        return undefined
      }
      length = Number(match[3])
      if (!Number.isSafeInteger(length) || length <= 0) {
        return undefined
      }
    } else if (match[1]) {
      const start = Number(match[1])
      const end = start + Number(match[2])
      if (!length || !text.trim() || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
        return undefined
      }
      tokens.push(makeWordAnnotationToken({ text, time: { start, end } }))
      text = ''
    } else {
      if (!length) {
        return undefined
      }
      text += match[4]!
    }
  }
  return cursor === value.length && finish() ? entries : undefined
}

// QRC consumes every kana tag, damaged or unmatched included; only the first valid reading is used.
const readRubies = (meta: runtime.Meta): RubySource[] | undefined => {
  let entries: RubySource[] | undefined
  const unknowns: runtime.UnknownEntry[] = []
  for (const entry of meta.unknowns) {
    if (entry.key === 'kana') {
      entries ??= readRubyEntries(entry.value)
    } else {
      unknowns.push(entry)
    }
  }
  meta.unknowns = unknowns
  return entries
}

const matchRubies = (words: (RubyWord | undefined)[], sources: RubySource[]): Map<number, number> => {
  const starts = new Map<number, number[]>()
  for (const [index, candidate] of words.entries()) {
    const start = candidate?.word.time?.start
    if (start !== undefined && Number.isSafeInteger(start) && start >= 0) {
      const queue = starts.get(start) ?? []
      queue.push(index)
      starts.set(start, queue)
    }
  }
  const timed = new Set<number>()
  const claims = new Map<number, number[]>()
  for (const [index, source] of sources.entries()) {
    const times = source.ruby.tokens.flatMap((token) => (token.time ? [token.time] : []))
    if (!times.length) {
      continue
    }
    timed.add(index)
    const start = times[0]!.start
    const end = times.at(-1)!.end
    if (start === undefined) {
      continue
    }
    let candidates = (starts.get(start) ?? []).filter((target) => {
      const candidate = words[target]!
      const finish = candidate.word.time?.end
      return (
        candidate.length === source.length &&
        finish !== undefined &&
        Number.isSafeInteger(finish) &&
        times.every((time) => {
          return time.start !== undefined && time.end !== undefined && time.start >= start && time.end >= time.start && time.end <= finish
        })
      )
    })
    if (times.length === source.ruby.tokens.length) {
      const exact = candidates.filter((target) => words[target]!.word.time!.end === end)
      if (exact.length) {
        candidates = exact
      }
    }
    if (candidates.length !== 1) {
      continue
    }
    const target = candidates[0]!
    const queue = claims.get(target) ?? []
    queue.push(index)
    claims.set(target, queue)
  }
  const matched = new Map<number, number>()
  for (const [target, queue] of claims) {
    if (queue.length === 1) {
      matched.set(queue[0]!, target)
    }
  }

  const anchors: [number, number][] = [[-1, -1], ...[...matched].sort((first, second) => first[0] - second[0]), [sources.length, words.length]]
  for (let index = 1; index < anchors.length; index += 1) {
    if (anchors[index]![1] <= anchors[index - 1]![1]) {
      return matched
    }
  }
  for (let index = 1; index < anchors.length; index += 1) {
    const [firstSource, firstWord] = anchors[index - 1]!
    const [lastSource, lastWord] = anchors[index]!
    const pending: number[] = []
    let compatible = true
    for (let source = firstSource + 1; source < lastSource; source += 1) {
      if (timed.has(source)) {
        compatible = false
        break
      }
      pending.push(source)
    }
    if (!compatible || !pending.length) {
      continue
    }
    const candidates: number[] = []
    for (let target = firstWord + 1; target < lastWord; target += 1) {
      const candidate = words[target]
      if (!candidate) {
        compatible = false
        break
      }
      if (candidate.byOrder) {
        candidates.push(target)
      }
    }
    // An incomplete interval cannot tell which reading or word is missing.
    if (
      !compatible ||
      candidates.length !== pending.length ||
      pending.some((source, position) => sources[source]!.length !== words[candidates[position]!]!.length)
    ) {
      continue
    }
    for (const [position, source] of pending.entries()) {
      matched.set(source, candidates[position]!)
    }
  }
  return matched
}

/**
 * Attaches whole-word ruby without changing the source text, segmentation, or timing.
 *
 * @param lines Original timed rows before filtering or sorting.
 * @param sources Readings with source coverage lengths and optional token times.
 *
 * @returns Annotated rows and matched source indices, preserving unchanged nodes.
 */
export const attachRubies = (lines: runtime.Line[], sources: RubySource[]): { lines: runtime.Line[]; matched: Set<number> } => {
  if (!sources.length) {
    return { lines, matched: new Set<number>() }
  }
  const words: (RubyWord | undefined)[] = []
  for (const line of lines) {
    if (line.type !== LineType.NORMAL) {
      continue
    }
    if (line.content?.text && RUBY_WORD_PATTERN.test(line.content.text)) {
      // Text-only rows must still block readings from shifting onto later words.
      words.push(undefined)
      continue
    }
    for (const word of line.content?.words ?? []) {
      if (word.type === WordType.NORMAL) {
        words.push({ word, length: [...word.text].length, byOrder: RUBY_WORD_PATTERN.test(word.text) })
      }
    }
  }
  const matched = matchRubies(words, sources)
  if (!matched.size) {
    return { lines, matched: new Set<number>() }
  }
  const annotations = new Map([...matched].map(([source, target]) => [words[target]!.word, sources[source]!.ruby]))
  const annotated = mapShared(lines, (line) => {
    const content = line.content
    if (!content) {
      return line
    }
    const words = mapShared(content.words, (word) => {
      const ruby = annotations.get(word)
      if (!ruby) {
        return word
      }
      return { ...word, annotation: makeWordAnnotation({ ...word.annotation, rubies: [...(word.annotation?.rubies ?? []), ruby] }) }
    })
    return words === content.words ? line : { ...line, content: { ...content, words } }
  })
  return { lines: annotated, matched: new Set(matched.keys()) }
}

const readMeta = (body: string, meta: runtime.Meta) => {
  const match = META_PATTERN.exec(body)
  if (!match) {
    return
  }
  const key = match[1]!.toLowerCase()
  const value = match[2]!.trim()
  switch (key) {
    case 'length':
    case 'duration': {
      const duration = parseTime(value) ?? (/^\d+$/.test(value) ? Number(value) : Number.NaN)
      if (Number.isFinite(duration)) {
        meta.duration = Math.trunc(duration)
      } else {
        meta.unknowns.push(makeUnknownEntry({ key, value }))
      }
      break
    }
    case 'offset':
      meta.offset = Math.trunc(Number(value)) || 0
      break
    case 'ti':
    case 'title':
      meta.titles.push(makeText({ text: value }))
      break
    case 'ar':
    case 'artist':
      meta.artists.push(makeText({ text: value }))
      break
    case 'al':
    case 'album':
      meta.albums.push(makeText({ text: value }))
      break
    case 'by':
    case 'author':
      meta.authors.push(makeText({ text: value }))
      break
    case 'isrc':
      meta.isrcs.push(value)
      break
    default:
      meta.unknowns.push(makeUnknownEntry({ key, value }))
      break
  }
}

const readTimeRange = (startText: string, durationText: string): NonNullable<runtime.Word['time']> => {
  const start = Number(startText)
  return makeTimeRange({ start, end: start + Number(durationText) })
}

const appendWords = (words: runtime.Word[], text: string, time?: runtime.Word['time']) => {
  for (const fragment of text.split(/(\p{White_Space}+)/u)) {
    if (!fragment) {
      continue
    }
    if (SEPARATORS.test(fragment)) {
      words.push(makeWordSpace({ text: fragment }))
    } else {
      // QRC gives the fragment one range, so whitespace splitting cannot invent finer timing.
      words.push(makeWordNormal({ text: fragment, time }))
    }
  }
}

const readWords = (text: string): runtime.Word[] | undefined => {
  const words: runtime.Word[] = []
  let cursor = 0
  let tagged = false
  for (const match of text.matchAll(WORD_PATTERN)) {
    tagged = true
    appendWords(words, text.slice(cursor, match.index), readTimeRange(match[1]!, match[2]!))
    cursor = match.index + match[0].length
  }
  if (!tagged) {
    return undefined
  }
  appendWords(words, text.slice(cursor))
  return words
}

/**
 * Kugou writes `//` where it holds no translation, in QRC source rows and in its language payload alike.
 *
 * @returns Whether the trimmed text is that sentinel instead of real content.
 */
export const isPlaceholderText = (text: string): boolean => {
  return text.trim() === '//'
}

const readLines = (text: string): { lines: runtime.Line[]; meta: runtime.Meta; placeholders: Set<number> } => {
  const lines: runtime.Line[] = []
  const meta = makeMeta()
  const placeholders = new Set<number>()
  for (const raw of text.split(/\r\n?|\n/)) {
    const line = raw.trimStart()
    const match = LINE_PATTERN.exec(line)
    if (match) {
      const time = readTimeRange(match[1]!, match[2]!)
      const text = line.slice(match[0].length)
      const words = readWords(text)
      const contentText = (words ? getWordsText(words) : text).trim()
      const placeholder = isPlaceholderText(contentText)
      if (placeholder) {
        placeholders.add(lines.length)
      }
      if (!contentText || placeholder) {
        lines.push(makeLineInstrumental({ time }))
      } else {
        const content = words ? makeLineContentWords(words) : makeLineContentText(text)
        lines.push(makeLineNormal({ time, content }))
      }
      continue
    }
    if (!line.startsWith('[')) {
      continue
    }
    for (const tag of line.matchAll(META_TAG_PATTERN)) {
      const body = tag[1]!
      if (isTime(body)) {
        continue
      }
      readMeta(body, meta)
    }
  }
  return { lines, meta, placeholders }
}

const readAnnotations = (text: string | null | undefined, timings: WeakMap<runtime.Line, AnnotationTiming>): runtime.Line[] => {
  if (!text) {
    return []
  }

  const { lines } = readLines(text)
  if (lines.length) {
    for (const line of lines) {
      timings.set(line, NATIVE_ANNOTATION_TIMING)
    }
    return lines
  }

  readLrc(text, {
    onLine: (line, timing) => {
      // QRC placeholders must keep both their timing slot and source precision after conversion.
      const annotation = isPlaceholderText(getContentText(line.content)) ? makeLineInstrumental({ time: line.time }) : line
      timings.set(annotation, timing)
      lines.push(annotation)
    },
  })

  return lines
}

/**
 * Parses plaintext or XML QRC, retaining explicit timing, word romanization, and ruby from kana metadata.
 * Original-track kana supplies ruby and is removed from the returned metadata.
 *
 * @param input Original lyrics with optional translation and romanization tracks.
 * @param options Independent line and word tolerances, with optional local roman recovery.
 *
 * @returns Canonical lyrics and source diagnostics; an empty result has INVALID status.
 */
export const parseQrc = (input: string | QrcParseInput, options: QrcParseOptions = {}): ParseResult => {
  const source = readContent(input)
  if (!source) {
    return finalizeLyric(makeLyric({ format: FORMAT, status: LyricStatus.INVALID }))
  }

  const parsed = readLines(source.original)
  const meta = parsed.meta
  const rubies = readRubies(meta)
  if (!parsed.lines.length) {
    return finalizeLyric(makeLyric({ format: FORMAT, status: LyricStatus.INVALID, meta }))
  }

  const timings = new WeakMap<runtime.Line, AnnotationTiming>()

  const translationText = source.translations && readText(source.translations)
  const translationLines = readAnnotations(translationText, timings)

  const romanText = source.romans && readText(source.romans)
  const romanLines = readAnnotations(romanText, timings)

  // Each track uses one syntax, so native word boundaries share its timestamp rounding allowance.
  const rounding = romanLines.some((line) => timings.get(line)?.rounding === 1) ? 1 : 0
  const wordTolerance = Number.isFinite(options.wordAnnotationTolerance) ? (options.wordAnnotationTolerance ?? 0) : 0

  const annotated = attachAnnotations(
    !rubies ? parsed.lines : attachRubies(parsed.lines, rubies).lines,
    { translations: translationLines, romans: romanLines },
    {
      matchByOrder: true,
      preservePlaceholders: true,
      tolerance: options.annotationTolerance,
      wordTolerance: Math.max(wordTolerance, rounding),
      wordFallback: options.wordAnnotationFallback,
      getTiming: (line) => timings.get(line),
    },
  )

  // Removing placeholders before alignment would shift annotations at duplicate timestamps.
  const lines = parsed.placeholders.size ? annotated.filter((_, index) => !parsed.placeholders.has(index)) : annotated
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
