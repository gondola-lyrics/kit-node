import type { runtime } from '@gondola-lyrics/model'
import type { AnnotationTiming } from '@root/utils'
import type { ParseResult } from '../result'
import type { QrcContent } from './common'

import {
  LyricStatus,
  Timing,
  deriveLanguageUsages,
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
  makeWordNormal,
  makeWordSpace,
} from '@gondola-lyrics/model/runtime'

import { isTime, parseTime } from '@root/utils'

import { parseWordTime } from '../lrc/utils'
import { finalizeLyric } from '../result'
import { FORMAT, LINE_PATTERN, readContent, readText } from './common'
import { attachAnnotations } from './utils'

export interface QrcParseOptions {
  /**
   * Extra tolerance in milliseconds for annotations left after exact time and row order matching.
   *
   * @default 0
   */
  annotationTolerance?: number
}

export type QrcParseInput = QrcContent

const WORD_PATTERN = /\((\d+),(\d+)\)/g
const META_PATTERN = /^([A-Za-z0-9_-]+)\s*:\s*([\s\S]*)$/
const META_TAG_PATTERN = /\[([^\]]*)\]/g
const ANNOTATION_TIME_PATTERN = /^(?:\d+:){0,2}\d+(?:\.(\d+))?$/
const ANNOTATION_WORD_PATTERN = /<([^>]*)>/g
const SEPARATORS = /^\p{White_Space}+$/u
const NATIVE_ANNOTATION_TIMING: AnnotationTiming = { precision: 1, rounding: 1 }

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
    if (fragment === '') {
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
      const contentText = (words === undefined ? text : getWordsText(words)).trim()
      if (contentText === '') {
        lines.push(makeLineInstrumental({ time }))
      } else {
        if (contentText === '//') {
          placeholders.add(lines.length)
        }
        const content = words === undefined ? makeLineContentText(text) : makeLineContentWords(words)
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

const readAnnotationText = (text: string): string => {
  if (!text.includes('<')) {
    return text.trim()
  }
  return text
    .replace(ANNOTATION_WORD_PATTERN, (tag: string, body: string) => {
      return parseWordTime(body, 0) === undefined ? tag : ''
    })
    .trim()
}

const readAnnotations = (source: string | undefined, timings: WeakMap<runtime.Line, AnnotationTiming>): runtime.Line[] => {
  if (source === undefined || source === '') {
    return []
  }
  const text = readText(source)
  if (text === null) {
    return []
  }
  const lines: runtime.Line[] = []
  const appendLine = (start: number, end: number | undefined, text: string, timing: AnnotationTiming) => {
    const time = { start, end }
    const line = text === '' ? makeLineInstrumental({ time }) : makeLineNormal({ time, content: { text } })
    timings.set(line, timing)
    lines.push(line)
  }
  const sourceLines = text.split(/\r\n?|\n/)
  for (const raw of sourceLines) {
    const line = raw.trimStart()
    const match = LINE_PATTERN.exec(line)
    if (match) {
      const start = Number(match[1])
      const text = line.slice(match[0].length).replace(WORD_PATTERN, '').trim()
      appendLine(start, start + Number(match[2]), text, NATIVE_ANNOTATION_TIMING)
    }
  }
  if (lines.length > 0) {
    return lines
  }

  // Reading auxiliary LRC directly keeps row order before model canonicalization sorts equal or drifting times.
  for (const raw of sourceLines) {
    const line = raw.trim()
    const tags = [...line.matchAll(META_TAG_PATTERN)]
    let group: { start: number; precision: number }[] = []
    const appendGroup = (content: string) => {
      if (group.length === 0) {
        return
      }
      const text = readAnnotationText(content)
      for (const time of group) {
        appendLine(time.start, undefined, text, { precision: time.precision })
      }
      group = []
    }
    for (const [index, tag] of tags.entries()) {
      const body = tag[1]!.trim()
      const start = parseTime(body)
      if (start !== undefined) {
        const clock = ANNOTATION_TIME_PATTERN.exec(body)
        const precision = clock === null ? 1 : 10 ** Math.max(0, 3 - (clock[1]?.length ?? 0))
        group.push({ start, precision })
      }
      const content = line.slice(tag.index + tag[0].length, tags[index + 1]?.index ?? line.length)
      if (content.trim() !== '') {
        appendGroup(content)
      }
    }
    appendGroup('')
  }
  return lines
}

/**
 * Parses plaintext or XML QRC without replacing explicit line or word timing.
 *
 * @param input Original lyrics with optional translation and romanization tracks.
 * @param options Additional annotation timing tolerance.
 *
 * @returns Canonical lyrics and source diagnostics; an empty result has INVALID status.
 */
export const parseQrc = (input: string | QrcParseInput, options: QrcParseOptions = {}): ParseResult => {
  const source = readContent(input) ?? { original: '' }
  const parsed = readLines(source.original)
  const meta = parsed.meta
  if (parsed.lines.length === 0) {
    return finalizeLyric(makeLyric({ format: FORMAT, status: LyricStatus.INVALID, meta }))
  }

  const timings = new WeakMap<runtime.Line, AnnotationTiming>()
  const translations = readAnnotations(source.translations, timings)
  const romans = readAnnotations(source.romans, timings)
  const annotated = attachAnnotations(
    parsed.lines,
    { translations, romans },
    {
      tolerance: options.annotationTolerance,
      getTiming: (line) => timings.get(line),
    },
  )
  // Removing placeholders before alignment would shift annotations at duplicate timestamps.
  const lines = parsed.placeholders.size === 0 ? annotated : annotated.filter((_, index) => !parsed.placeholders.has(index))
  return finalizeLyric(
    makeLyric({
      format: FORMAT,
      status: lines.length === 0 ? LyricStatus.INVALID : LyricStatus.VALID,
      timing: lines.some(isWordLevelLine) ? Timing.WORD : Timing.LINE,
      meta,
      lines,
      languages: deriveLanguageUsages(lines),
    }),
  )
}
