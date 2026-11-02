import type { runtime } from '@gondola-lyrics/model'

import {
  LineType,
  WordType,
  deriveLineRomans,
  getContentText,
  makeLineAnnotation,
  makeLineAnnotationRoman,
  makeLineAnnotationTranslation,
  makeWordAnnotation,
  makeWordAnnotationRoman,
  makeWordAnnotationToken,
} from '@gondola-lyrics/model/runtime'

import { lowerBound, mapShared } from './array'
import { lowerTag } from './language'

export interface AnnotationSources {
  translations?: runtime.Line[]
  romans?: runtime.Line[]
}

export interface AnnotationTiming {
  /**
   * Stored timestamp precision in milliseconds.
   *
   * @default 1
   */
  precision?: number
  /**
   * Allowed timestamp rounding difference in milliseconds.
   *
   * @default 0
   */
  rounding?: 0 | 1
}

export interface AnnotationMatchOptions {
  /**
   * Additional drift allowed after exact and optional row order matching, in milliseconds.
   *
   * @default 0
   */
  tolerance?: number
  /**
   * Fills complete tracks by input order when every exact match agrees.
   *
   * @default false
   */
  matchByOrder?: boolean
  /**
   * Keeps empty and // rows in timing queues without displaying their text.
   *
   * @default false
   */
  preservePlaceholders?: boolean
  /**
   * Retains source timestamp information without adding fields to model lines.
   */
  getTiming?: (line: runtime.Line) => AnnotationTiming | undefined
}

export interface AnnotationAttachOptions extends AnnotationMatchOptions {
  /**
   * Maximum drift of roman token boundaries outside their matched word, in milliseconds.
   * Matched boundaries are adjusted to the word range; the original word is unchanged.
   *
   * @default 0
   */
  wordTolerance?: number
}

interface WordRange {
  start: number
  end?: number
}

interface RomanPart {
  word: runtime.Word
  text: string
  after: string
}

interface RomanTarget {
  word: runtime.Word
  index: number
  time: WordRange
}

interface TimeBucket {
  start: number
  indices: number[]
  mixed: boolean
}

interface TimeIndex {
  starts: (number | undefined)[]
  lyricRows: number[]
  targets: Map<number, number[]>
  buckets: Map<number, Map<number, TimeBucket>>
  ordered?: number[]
}

interface SourceIndex {
  starts: (number | undefined)[]
  precisions: number[]
  roundings: (0 | 1)[]
  indices: number[]
  readable: number[]
}

type SourceGroups = Map<number, Map<number, number[]>>

const readText = (line: runtime.Line) => {
  return getContentText(line.content).trim()
}

/**
 * Combines explicit roman tracks with display-only word aggregations, preferring explicit entries for the same language.
 *
 * @param line A lead or background line whose annotations are being displayed or written.
 *
 * @returns Roman text for rendering; derived entries must not be stored back on the line.
 */
export const getLineRomans = (line: Pick<runtime.Line, 'content' | 'annotation'>): runtime.LineAnnotationRoman[] => {
  const explicit = line.annotation?.romans ?? []
  const languages = new Set(explicit.map((item) => lowerTag(item.language)))
  const derived = deriveLineRomans(line.content).filter((item) => !languages.has(lowerTag(item.language)))
  return derived.length === 0 ? explicit : [...explicit, ...derived]
}

const readWordRange = (word: runtime.Word): WordRange | undefined => {
  const time = word.time
  if (
    !time ||
    !Number.isSafeInteger(time.start) ||
    time.start < 0 ||
    (time.end !== undefined && (!Number.isSafeInteger(time.end) || time.end < time.start))
  ) {
    return undefined
  }
  return { start: time.start, end: time.end }
}

const containsRomanTime = (source: WordRange, target: WordRange, tolerance: number): boolean => {
  const end = target.end ?? Number.POSITIVE_INFINITY
  if (source.start < target.start - tolerance || (source.end !== undefined && source.end > end + tolerance)) {
    return false
  }
  if (source.end === undefined || source.start === source.end) {
    return target.start === target.end ? source.start <= end + tolerance : source.start < end + tolerance
  }
  return true
}

const readRomanLanguage = (source: runtime.Line) => {
  const languages = new Set(source.languages.map(lowerTag).filter((language) => language !== undefined))
  for (const word of source.content?.words ?? []) {
    const language = word.type === WordType.NORMAL ? lowerTag(word.language) : undefined
    if (language !== undefined) {
      languages.add(language)
    }
  }
  return {
    language: languages.size === 1 ? languages.values().next().value : lowerTag(source.languages[0]),
    consistent: languages.size <= 1,
  }
}

const attachWordRomans = (line: runtime.Line, source: runtime.Line, tolerance: number, language: string | undefined): runtime.Line | undefined => {
  const content = line.content
  const sourceContent = source.content
  if (!content?.words.length || content.text !== undefined || !sourceContent?.words.length || sourceContent.text !== undefined) {
    return undefined
  }

  const targets: RomanTarget[] = []
  const spaces = [0]
  for (const [index, word] of content.words.entries()) {
    spaces.push(spaces[index]! + (word.type === WordType.SPACE ? 1 : 0))
    if (word.type === WordType.SPACE) {
      continue
    }
    const time = readWordRange(word)
    if (word.type !== WordType.NORMAL || !time) {
      return undefined
    }
    targets.push({ word, index, time })
  }
  const parts: RomanPart[] = []
  for (const word of sourceContent.words) {
    if (word.type === WordType.SPACE) {
      const previous = parts.at(-1)
      if (previous !== undefined) {
        previous.after += word.text
      }
      continue
    }
    if (word.type !== WordType.NORMAL || word.text.trim() === '') {
      return undefined
    }
    parts.push({ word, text: word.text, after: '' })
  }
  if (parts.length === 0) {
    return undefined
  }
  parts[0]!.text = parts[0]!.text.trimStart()
  parts.at(-1)!.text = parts.at(-1)!.text.trimEnd()

  const groups = new Map<runtime.Word, runtime.WordAnnotationToken[]>()
  const assigned: { target: RomanTarget; token: runtime.WordAnnotationToken }[] = []
  let previousTarget = -1
  for (const part of parts) {
    const time = readWordRange(part.word)
    if (!time) {
      return undefined
    }
    const candidates = targets.filter((target) => containsRomanTime(time, target.time, tolerance))
    // An unknown source end cannot distinguish overlapping words.
    const exact =
      time.end === undefined
        ? []
        : candidates.filter((target) => {
            return target.time.start === time.start && target.time.end === time.end
          })
    const points = time.start === time.end ? candidates.filter((target) => target.time.start === target.time.end) : []
    const contained = candidates.filter((target) => containsRomanTime(time, target.time, 0))
    const preferred = exact.length > 0 ? exact : points.length > 0 ? points : contained.length > 0 ? contained : candidates
    if (preferred.length !== 1) {
      return undefined
    }
    const target = preferred[0]!
    if (target.index < previousTarget || target.word.annotation?.romans.some((item) => lowerTag(item.language) === language)) {
      return undefined
    }
    previousTarget = target.index
    const bound = target.time.end ?? Number.POSITIVE_INFINITY
    const start = Math.min(bound, Math.max(target.time.start, time.start))
    // An open source tail can use its uniquely matched word's end without dividing time by text length.
    const end = time.end === undefined ? target.time.end : Math.min(bound, Math.max(target.time.start, time.end))
    const token = makeWordAnnotationToken({ text: part.text, time: { start, end } })
    const tokens = groups.get(target.word) ?? []
    tokens.push(token)
    groups.set(target.word, tokens)
    assigned.push({ target, token })
  }

  for (let index = 0; index < assigned.length - 1; index += 1) {
    const current = assigned[index]!
    const next = assigned[index + 1]!
    const separator = parts[index]!.after
    const spaced = next.target.index > current.target.index && spaces[next.target.index]! > spaces[current.target.index + 1]!
    if (!spaced) {
      current.token.text += separator
      continue
    }
    const space = separator.indexOf(' ')
    if (space === -1) {
      return undefined
    }
    // The model supplies one space between romanized words separated in the original text.
    current.token.text += separator.slice(0, space)
    next.token.text = separator.slice(space + 1) + next.token.text
  }

  const words = mapShared(content.words, (word) => {
    const tokens = groups.get(word)
    if (tokens === undefined) {
      return word
    }
    const roman = makeWordAnnotationRoman({ language, tokens })
    return { ...word, annotation: makeWordAnnotation({ ...word.annotation, romans: [...(word.annotation?.romans ?? []), roman] }) }
  })
  const result = { ...line, content: { ...content, words } }
  const derived = deriveLineRomans(result.content).find((item) => lowerTag(item.language) === language)
  return derived?.text === readText(source) ? result : undefined
}

const isReadable = (text: string, preservePlaceholders: boolean): boolean => {
  return text !== '' && (!preservePlaceholders || text !== '//')
}

const createSourceIndex = (lines: runtime.Line[], options: AnnotationMatchOptions): SourceIndex => {
  const result: SourceIndex = { starts: [], precisions: [], roundings: [], indices: [], readable: [] }
  const preserve = options.preservePlaceholders === true
  for (const [index, line] of lines.entries()) {
    const start = line.time?.start
    const text = readText(line)
    const timing = options.getTiming?.(line)
    const precision = timing?.precision
    const readable = isReadable(text, preserve)
    result.starts.push(start)
    result.precisions.push(precision !== undefined && Number.isFinite(precision) && precision > 0 ? precision : 1)
    result.roundings.push(timing?.rounding === 1 ? 1 : 0)
    const timed = start !== undefined
    if ((timed && (preserve || text !== '')) || (options.matchByOrder && readable)) {
      result.indices.push(index)
      if (readable) {
        result.readable.push(index)
      }
    }
  }
  return result
}

const createTimeIndex = (lines: runtime.Line[], options: AnnotationMatchOptions): TimeIndex => {
  const starts: (number | undefined)[] = []
  const lyricRows: number[] = []
  const targets = new Map<number, number[]>()
  for (const [index, line] of lines.entries()) {
    const start = line.time?.start
    const valid = start !== undefined && (!options.preservePlaceholders || Number.isFinite(start))
    starts.push(valid ? start : undefined)
    if (options.matchByOrder && line.type === LineType.NORMAL && isReadable(readText(line), options.preservePlaceholders === true)) {
      lyricRows.push(index)
    }
    if (!valid) {
      continue
    }
    const queue = targets.get(start) ?? []
    queue.push(index)
    targets.set(start, queue)
  }
  return { starts, lyricRows, targets, buckets: new Map() }
}

const getTimeBuckets = (index: TimeIndex, precision: number): Map<number, TimeBucket> => {
  const cached = index.buckets.get(precision)
  if (cached !== undefined) {
    return cached
  }
  const buckets = new Map<number, TimeBucket>()
  for (const [target, start] of index.starts.entries()) {
    if (start === undefined || !Number.isFinite(start)) {
      continue
    }
    const key = Math.floor(start / precision)
    let bucket = buckets.get(key)
    if (bucket === undefined) {
      bucket = { start, indices: [], mixed: false }
      buckets.set(key, bucket)
    }
    bucket.indices.push(target)
    bucket.mixed ||= bucket.start !== start
  }
  index.buckets.set(precision, buckets)
  return buckets
}

const matchDuplicates = (start: number, count: number, index: TimeIndex, groups: SourceGroups, sources: SourceIndex): number[] | undefined => {
  const result: number[] = []
  const collect = (precision: number, key: number, roundingOnly: boolean): boolean => {
    const queue = groups.get(precision)?.get(key)
    if (queue === undefined) {
      return true
    }
    const bucket = getTimeBuckets(index, precision).get(key)
    if (bucket !== undefined && (bucket.mixed || bucket.start !== start)) {
      return roundingOnly && queue.every((source) => sources.roundings[source] !== 1)
    }
    for (const source of queue) {
      const sourceStart = sources.starts[source]!
      const rounded = sources.roundings[source] === 1
      if (roundingOnly && !rounded) {
        continue
      }
      if (
        rounded &&
        ((sourceStart - 1 !== start && index.targets.has(sourceStart - 1)) || (sourceStart + 1 !== start && index.targets.has(sourceStart + 1)))
      ) {
        return false
      }
      result.push(source)
      if (result.length > count) {
        return false
      }
    }
    return true
  }
  for (const precision of groups.keys()) {
    if (!collect(precision, Math.floor(start / precision), false)) {
      return undefined
    }
  }
  for (const neighbor of [start - 1, start + 1]) {
    if (neighbor !== start && !collect(1, Math.floor(neighbor), true)) {
      return undefined
    }
  }
  return result
}

const matchAnnotations = (index: TimeIndex, sources: SourceIndex, options: AnnotationMatchOptions): Map<number, number> => {
  const matched = new Map<number, number>()
  if (sources.indices.length === 0) {
    return matched
  }
  const preserve = options.preservePlaceholders === true
  const byStart = new Map<number, number[]>()
  for (const source of sources.indices) {
    const start = sources.starts[source]
    if (start === undefined || (preserve && !Number.isFinite(start))) {
      continue
    }
    const queue = byStart.get(start) ?? []
    queue.push(source)
    byStart.set(start, queue)
  }
  const usedLines = new Set<number>()
  const usedSources = new Set<number>()
  const ambiguous = new Set<number>()
  const assign = (target: number, source: number) => {
    matched.set(target, source)
    usedLines.add(target)
    usedSources.add(source)
  }

  for (const [start, queue] of index.targets) {
    const candidates = byStart.get(start)
    if (candidates === undefined) {
      continue
    }
    if (queue.length > 1) {
      // Preserved placeholders need complete duplicate queues to identify their slots.
      if (!preserve || candidates.length === queue.length) {
        const count = Math.min(queue.length, candidates.length)
        for (let position = 0; position < count; position += 1) {
          assign(queue[position]!, candidates[position]!)
        }
      }
      continue
    }
    let source = candidates[0]!
    for (const candidate of candidates) {
      if (sources.precisions[candidate]! < sources.precisions[source]!) {
        source = candidate
      }
    }
    assign(queue[0]!, source)
  }
  if (usedSources.size === sources.indices.length) {
    return matched
  }

  if (options.matchByOrder && sources.readable.length > 0 && sources.readable.length === index.lyricRows.length) {
    let compatible = true
    // Counts can agree after unrelated omissions, so row order must preserve exact matches.
    for (const [position, target] of index.lyricRows.entries()) {
      const source = sources.readable[position]!
      const previous = matched.get(target)
      if ((usedLines.has(target) && previous !== source) || (usedSources.has(source) && previous !== source)) {
        compatible = false
        break
      }
    }
    if (compatible) {
      for (const [position, target] of index.lyricRows.entries()) {
        const source = sources.readable[position]!
        if (!usedSources.has(source)) {
          assign(target, source)
        }
      }
      return matched
    }
  }

  if (preserve || options.getTiming !== undefined) {
    const groups: SourceGroups = new Map()
    for (const source of sources.indices) {
      const start = sources.starts[source]
      if (usedSources.has(source) || start === undefined || !Number.isFinite(start)) {
        continue
      }
      const precision = sources.precisions[source]!
      let group = groups.get(precision)
      if (group === undefined) {
        group = new Map()
        groups.set(precision, group)
      }
      const key = Math.floor(start / precision)
      const queue = group.get(key) ?? []
      queue.push(source)
      group.set(key, queue)
    }

    for (const [start, queue] of index.targets) {
      if (queue.length < 2 || usedLines.has(queue[0]!)) {
        continue
      }
      const candidates = matchDuplicates(start, queue.length, index, groups, sources)
      if (candidates === undefined || candidates.length !== queue.length) {
        continue
      }
      candidates.sort((first, second) => first - second)
      for (const [position, source] of candidates.entries()) {
        assign(queue[position]!, source)
      }
    }

    for (const precision of [...groups.keys()].sort((first, second) => first - second)) {
      const candidates = getTimeBuckets(index, precision)
      for (const [key, entries] of groups.get(precision)!) {
        const bucket = candidates.get(key)
        if (bucket === undefined) {
          continue
        }
        const sourceQueue = entries.filter((source) => !usedSources.has(source))
        const targetQueue = bucket.indices.filter((target) => !usedLines.has(target))
        if (sourceQueue.length === 0 || targetQueue.length === 0) {
          continue
        }
        // Incomplete precision buckets cannot reveal which row is missing.
        if ((precision > 1 || targetQueue.length > 1) && sourceQueue.length !== targetQueue.length) {
          for (const source of sourceQueue) {
            ambiguous.add(source)
          }
          continue
        }
        const count = Math.min(sourceQueue.length, targetQueue.length)
        for (let position = 0; position < count; position += 1) {
          assign(targetQueue[position]!, sourceQueue[position]!)
        }
      }
    }

    const rounding = new Map<number, number>()
    const claims = new Map<number, number>()
    for (const source of sources.indices) {
      const start = sources.starts[source]
      if (sources.roundings[source] !== 1 || usedSources.has(source) || ambiguous.has(source) || start === undefined || !Number.isFinite(start)) {
        continue
      }
      let target = -1
      let count = 0
      for (const neighbor of [start - 1, start + 1]) {
        for (const candidate of index.targets.get(neighbor) ?? []) {
          if (usedLines.has(candidate)) {
            continue
          }
          target = candidate
          count += 1
          claims.set(candidate, (claims.get(candidate) ?? 0) + 1)
        }
      }
      if (count === 1) {
        rounding.set(source, target)
      } else if (count > 1) {
        ambiguous.add(source)
      }
    }
    // Rounding matches need uniqueness on both sides to prevent competing sources from taking a row.
    for (const [source, target] of rounding) {
      if (claims.get(target) === 1) {
        assign(target, source)
      } else {
        ambiguous.add(source)
      }
    }
  }

  const tolerance = Number.isFinite(options.tolerance) ? Math.max(0, options.tolerance ?? 0) : 0
  if (tolerance === 0) {
    return matched
  }
  const ordered = (index.ordered ??= [...index.targets.keys()].filter(Number.isFinite).sort((first, second) => first - second))
  const cursors = new Map<number, number>()
  for (const source of sources.indices) {
    const start = sources.starts[source]
    if (usedSources.has(source) || ambiguous.has(source) || start === undefined || !Number.isFinite(start)) {
      continue
    }
    let target = -1
    let distance = Number.POSITIVE_INFINITY
    const end = start + tolerance
    for (let position = lowerBound(ordered, start - tolerance); position < ordered.length && ordered[position]! <= end; position += 1) {
      const targetStart = ordered[position]!
      const current = Math.abs(targetStart - start)
      if (current > tolerance || current > distance) {
        continue
      }
      const queue = index.targets.get(targetStart)!
      let cursor = cursors.get(targetStart) ?? 0
      while (cursor < queue.length && usedLines.has(queue[cursor]!)) {
        cursor += 1
      }
      cursors.set(targetStart, cursor)
      const candidate = queue[cursor]
      if (candidate !== undefined && (current < distance || (current === distance && candidate < target))) {
        target = candidate
        distance = current
      }
    }
    if (target !== -1) {
      assign(target, source)
    }
  }
  return matched
}

/**
 * Matches annotation tracks against one shared time index while keeping each track's assignments independent.
 *
 * @param lines Original rows in input order.
 * @param sources Translation and romanization rows, including any preserved timing placeholders.
 * @param options Matching rules and source timestamp information.
 *
 * @returns Source row indices keyed by original row index for each track.
 */
const matchAnnotationTracks = (lines: runtime.Line[], sources: AnnotationSources, options: AnnotationMatchOptions = {}) => {
  const translations = createSourceIndex(sources.translations ?? [], options)
  const romans = createSourceIndex(sources.romans ?? [], options)
  const index = createTimeIndex(lines, options)
  return { translations: matchAnnotations(index, translations, options), romans: matchAnnotations(index, romans, options) }
}

const attachTracks = (lines: runtime.Line[], sources: AnnotationSources, options: AnnotationMatchOptions, wordTolerance?: number): runtime.Line[] => {
  if (lines.length === 0 || ((sources.translations?.length ?? 0) === 0 && (sources.romans?.length ?? 0) === 0)) {
    return lines
  }
  const { translations, romans } = matchAnnotationTracks(lines, sources, options)
  if (translations.size === 0 && romans.size === 0) {
    return lines
  }
  let result = lines
  for (const [index, line] of lines.entries()) {
    const translationIndex = translations.get(index)
    const romanIndex = romans.get(index)
    const translation = translationIndex === undefined ? undefined : sources.translations![translationIndex]
    const roman = romanIndex === undefined ? undefined : sources.romans![romanIndex]
    const translationText = translation === undefined ? '' : readText(translation)
    const romanText = roman === undefined ? '' : readText(roman)
    const hasTranslation = translationText !== '' && (!options.preservePlaceholders || translationText !== '//')
    const hasRoman = romanText !== '' && (!options.preservePlaceholders || romanText !== '//')
    if (line.type === LineType.INSTRUMENTAL || (!hasTranslation && !hasRoman)) {
      continue
    }
    const romanLanguage = hasRoman && wordTolerance !== undefined ? readRomanLanguage(roman!) : undefined
    const words =
      romanLanguage?.consistent && wordTolerance !== undefined ? attachWordRomans(line, roman!, wordTolerance, romanLanguage.language) : undefined
    let annotated = words ?? line
    if (hasTranslation || (hasRoman && words === undefined)) {
      const annotation = makeLineAnnotation({
        translations: [...(annotated.annotation?.translations ?? [])],
        romans: [...(annotated.annotation?.romans ?? [])],
      })
      if (hasTranslation) {
        annotation.translations.push(makeLineAnnotationTranslation({ text: translationText, language: translation!.languages[0] }))
      }
      if (hasRoman && words === undefined) {
        annotation.romans.push(
          makeLineAnnotationRoman({ text: romanText, language: romanLanguage === undefined ? roman!.languages[0] : romanLanguage.language }),
        )
      }
      annotated = { ...annotated, annotation }
    }
    if (result === lines) {
      result = lines.slice()
    }
    result[index] = annotated
  }
  return result
}

/**
 * Attaches matched tracks as line annotations while preserving existing annotations and unchanged row identities.
 *
 * @param lines Original rows, including timing slots that cannot carry annotations.
 * @param sources Translation and romanization rows as model lines.
 * @param options Matching rules; defaults use exact time and optional extra tolerance.
 *
 * @returns Annotated rows, reusing the original array when no visible annotation changes.
 */
export const attachLineAnnotations = (lines: runtime.Line[], sources: AnnotationSources, options: AnnotationMatchOptions = {}): runtime.Line[] => {
  return attachTracks(lines, sources, options)
}

/**
 * Attaches complete timed roman tracks to words and retains the source line annotation when word matching is incomplete.
 * Translations remain line-level, and successful word tracks are not duplicated on the line.
 *
 * @param lines Original rows before final normalization.
 * @param sources Translation and romanization rows as model lines.
 * @param options Independent line matching and word boundary tolerances.
 *
 * @returns Annotated rows with original text and word timing preserved.
 */
export const attachAnnotations = (lines: runtime.Line[], sources: AnnotationSources, options: AnnotationAttachOptions = {}): runtime.Line[] => {
  const tolerance = Number.isFinite(options.wordTolerance) ? Math.max(0, options.wordTolerance ?? 0) : 0
  return attachTracks(lines, sources, options, tolerance)
}
