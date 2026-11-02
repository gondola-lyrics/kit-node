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

import { lowerBound } from './array'
import { combinesKana } from './kana'
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
   * Keeps empty rows in timing queues so later annotations retain their slots.
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
  /**
   * Fills unmatched roman fragments from unique two-kana combination starts or equal-sized gaps between timing anchors.
   * Cross-word checks reuse the word tolerance, and recovered token times are clipped to the original word.
   * Untimed fragments inherit the word range and are placed by order only in single-word gaps or gaps anchored on both sides.
   *
   * @default false
   */
  wordFallback?: boolean
}

interface RomanTarget {
  word: runtime.Word
  index: number
  time: runtime.TimeRange
  spaces: number
  tokens: runtime.WordAnnotationToken[]
}

interface RomanSource {
  word: runtime.Word
  time?: runtime.TimeRange
  separator: string
  target?: RomanTarget
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

interface AnnotationSource {
  line: runtime.Line
  index: number
  text: string
  start?: number
  precision: number
  rounding: 0 | 1
}

type SourceGroups = Map<number, Map<number, AnnotationSource[]>>

const readText = (line: runtime.Line) => {
  return getContentText(line.content).trim()
}

/**
 * Combines explicit roman tracks with display-only word aggregations, preferring explicit entries for the same language.
 *
 * Derived entries must not be stored back on the line.
 */
export const getLineRomans = (line: Pick<runtime.Line, 'content' | 'annotation'>): runtime.LineAnnotationRoman[] => {
  const explicit = line.annotation?.romans ?? []
  const languages = new Set(explicit.map((item) => lowerTag(item.language)))
  const derived = deriveLineRomans(line.content).filter((item) => !languages.has(lowerTag(item.language)))
  return derived.length ? [...explicit, ...derived] : explicit
}

const readWordRange = (word: runtime.Word): runtime.TimeRange | undefined => {
  const time = word.time
  if (
    !time ||
    !Number.isSafeInteger(time.start) ||
    time.start < 0 ||
    (time.end !== undefined && (!Number.isSafeInteger(time.end) || time.end < time.start))
  ) {
    return undefined
  }
  return time
}

const containsRomanTime = (source: runtime.TimeRange, target: runtime.TimeRange, tolerance: number): boolean => {
  const end = target.end ?? Number.POSITIVE_INFINITY
  if (source.start < target.start - tolerance || (source.end !== undefined && source.end > end + tolerance)) {
    return false
  }
  if (source.end === undefined || source.start === source.end) {
    return target.start === target.end ? source.start <= end + tolerance : source.start < end + tolerance
  }
  return true
}

// `null` reports a tie between equal-priority words and `undefined` no containing word at all.
// Both leave the fragment unmatched; only a tie rules out local recovery.
const matchRomanTarget = (time: runtime.TimeRange, targets: RomanTarget[], tolerance: number): RomanTarget | null | undefined => {
  let matched: RomanTarget | undefined
  let priority = -1
  for (const target of targets) {
    if (!containsRomanTime(time, target.time, tolerance)) {
      continue
    }
    // A known end is required to prefer an exact range over overlapping words.
    const exact = time.end !== undefined && time.start === target.time.start && time.end === target.time.end
    const point = time.start === time.end && target.time.start === target.time.end
    const rank = exact ? 3 : point ? 2 : containsRomanTime(time, target.time, 0) ? 1 : 0
    if (rank > priority) {
      matched = target
      priority = rank
    } else if (rank === priority) {
      // A later higher-priority candidate can still resolve this tie.
      matched = undefined
    }
  }
  return matched ?? (priority === -1 ? undefined : null)
}

const overlapLength = (time: runtime.TimeRange, target: RomanTarget): number => {
  const finish = time.end ?? time.start
  return Math.min(finish, target.time.end ?? Number.POSITIVE_INFINITY) - Math.max(time.start, target.time.start)
}

const sharesLanguage = (targets: (RomanTarget | undefined)[]): boolean => {
  const languages = new Set(targets.flatMap((target) => (target ? [lowerTag(target.word.language)] : [])).filter(Boolean))
  return languages.size <= 1
}

const isOrderedByTime = (targets: RomanTarget[]): boolean => {
  return targets.every((target, index) => {
    return target.time.start >= (targets[index - 1]?.time.start ?? 0)
  })
}

const canExtendToFollowing = (target: RomanTarget, following: RomanTarget): boolean => {
  const first = lowerTag(target.word.language)
  const second = lowerTag(following.word.language)
  return (!first || !second || first === second) && combinesKana(target.word.text, following.word.text)
}

const recoverRomanTargets = (
  sources: RomanSource[],
  targets: RomanTarget[],
  tolerance: number,
  rounding: number,
  language: string | undefined,
): boolean => {
  // Fragment ends drift by the word tolerance, while word adjacency and combination starts only allow timestamp rounding.
  const slack = Math.max(tolerance, rounding)
  const used = new Set(sources.flatMap((source) => (source.target ? [source.target] : [])))
  const reserved = new Set<RomanTarget>()
  const conflict = (target: RomanTarget) => {
    return target.word.annotation?.romans.some((item) => lowerTag(item.language) === language)
  }

  for (const [index, source] of sources.entries()) {
    const time = source.time
    if (source.target || !time || time.end === undefined) {
      continue
    }
    // A looser start would let a small kana's own drifted fragment claim the base kana instead.
    const exact = targets.filter((target) => target.time.start === time.start)
    const candidates = exact.length ? exact : targets.filter((target) => Math.abs(target.time.start - time.start) <= rounding)
    if (candidates.length !== 1) {
      continue
    }
    const target = candidates[0]!
    const following = targets[targets.indexOf(target) + 1]
    if (!following || following.index !== target.index + 1 || !canExtendToFollowing(target, following)) {
      continue
    }
    if (used.has(target) || used.has(following) || reserved.has(target) || reserved.has(following)) {
      continue
    }
    if (conflict(target) || following.word.annotation?.romans.length) {
      continue
    }
    const previous = sources.slice(0, index).findLast((item) => item.target)?.target
    const next = sources.slice(index + 1).find((item) => item.target)?.target
    if (target.index <= (previous?.index ?? -1) || following.index >= (next?.index ?? Number.POSITIVE_INFINITY)) {
      continue
    }
    if (target.time.start < (previous?.time.start ?? 0) || following.time.start > (next?.time.start ?? Number.POSITIVE_INFINITY)) {
      continue
    }
    if (!sharesLanguage([previous, target, following, next])) {
      continue
    }
    // The fragment must run from the base kana into its adjacent small kana and touch nothing else.
    if (target.time.end === undefined || following.time.end === undefined || Math.abs(following.time.start - target.time.end) > rounding) {
      continue
    }
    if (time.end <= target.time.end || time.end > following.time.end + slack) {
      continue
    }
    if (targets.some((candidate) => candidate !== target && candidate !== following && overlapLength(time, candidate) > slack)) {
      continue
    }
    source.target = target
    used.add(target)
    reserved.add(following)
  }

  for (let start = 0; start < sources.length; start += 1) {
    if (sources[start]!.target) {
      continue
    }
    let end = start + 1
    while (end < sources.length && !sources[end]!.target) {
      end += 1
    }
    const previous = sources[start - 1]?.target
    const next = sources[end]?.target
    const pending = targets.filter((target) => {
      return target.index > (previous?.index ?? -1) && target.index < (next?.index ?? Number.POSITIVE_INFINITY) && !reserved.has(target)
    })
    if (pending.length !== end - start) {
      return false
    }
    // Order alone places an untimed fragment, so its gap must hold one word or be pinned by anchors on both sides.
    const untimed = sources.slice(start, end).some((source) => !source.time)
    if (untimed && pending.length > 1 && (!previous || !next)) {
      return false
    }
    const boundaries = [previous, ...pending, next].filter((target) => target !== undefined)
    if (!sharesLanguage(boundaries) || !isOrderedByTime(boundaries)) {
      return false
    }
    for (const [offset, target] of pending.entries()) {
      const source = sources[start + offset]!
      if (used.has(target) || conflict(target)) {
        return false
      }
      const time = source.time
      // Equal counts cannot override a fragment pointing into another word.
      if (time && (overlapLength(time, target) <= 0 || targets.some((candidate) => candidate !== target && overlapLength(time, candidate) > slack))) {
        return false
      }
      source.target = target
      used.add(target)
    }
    start = end - 1
  }
  return true
}

const readRomanLanguage = (source: runtime.Line) => {
  const languages = new Set(source.languages.map(lowerTag).filter(Boolean))
  for (const word of source.content?.words ?? []) {
    const language = word.type === WordType.NORMAL ? lowerTag(word.language) : undefined
    if (language) {
      languages.add(language)
    }
  }
  return {
    language: languages.size === 1 ? languages.values().next().value : lowerTag(source.languages[0]),
    consistent: languages.size <= 1,
  }
}

const attachWordRomans = (
  line: runtime.Line,
  source: AnnotationSource,
  tolerance: number,
  language: string | undefined,
  fallback: boolean,
): runtime.Line | undefined => {
  const content = line.content
  const sourceContent = source.line.content
  if (!content?.words.length || content.text !== undefined || !sourceContent?.words.length || sourceContent.text !== undefined) {
    return undefined
  }

  const targets: RomanTarget[] = []
  let spaces = 0
  for (const [index, word] of content.words.entries()) {
    if (word.type === WordType.SPACE) {
      spaces += 1
      continue
    }
    const time = readWordRange(word)
    if (word.type !== WordType.NORMAL || !time) {
      return undefined
    }
    targets.push({ word, index, time, spaces, tokens: [] })
  }

  const sources: RomanSource[] = []
  let separator = ''
  for (const word of sourceContent.words) {
    if (word.type === WordType.SPACE) {
      separator += word.text
      continue
    }
    const time = readWordRange(word)
    if (word.type !== WordType.NORMAL || !word.text.trim() || (word.time && !time) || (!time && !fallback)) {
      return undefined
    }
    const target = time ? matchRomanTarget(time, targets, tolerance) : undefined
    if (target === null || (!target && !fallback)) {
      return undefined
    }
    sources.push({ word, time, separator, target })
    separator = ''
  }

  const anchors = sources.flatMap((source) => (source.target ? [source.target] : []))
  if (anchors.some((target, index) => target.index < (anchors[index - 1]?.index ?? -1))) {
    return undefined
  }
  const recovered = fallback && sources.some((item) => !item.target)
  if (recovered && !recoverRomanTargets(sources, targets, tolerance, source.rounding, language)) {
    return undefined
  }

  let previous: RomanTarget | undefined
  let previousStart = 0
  for (const { word, time, separator, target } of sources) {
    if (!target || target.index < (previous?.index ?? -1) || target.word.annotation?.romans.some((item) => lowerTag(item.language) === language)) {
      return undefined
    }
    const bound = target.time.end ?? Number.POSITIVE_INFINITY
    const start = time ? Math.min(bound, Math.max(target.time.start, time.start)) : target.time.start
    // An open source tail can use its uniquely matched word's end without dividing time by text length.
    const end = time?.end === undefined ? target.time.end : Math.min(bound, Math.max(target.time.start, time.end))
    if (recovered && start < previousStart) {
      return undefined
    }
    previousStart = start
    const token = makeWordAnnotationToken({ text: previous ? word.text : word.text.trimStart(), time: { start, end } })
    if (previous) {
      const last = previous.tokens.at(-1)!
      if (target.spaces > previous.spaces) {
        const space = separator.indexOf(' ')
        if (space === -1) {
          return undefined
        }
        // The model supplies one space even across skipped words; retain the rest in the tokens.
        last.text += separator.slice(0, space)
        token.text = separator.slice(space + 1) + token.text
      } else {
        last.text += separator
      }
    }
    target.tokens.push(token)
    previous = target
  }
  if (!previous) {
    return undefined
  }
  const last = previous.tokens.at(-1)!
  last.text = last.text.trimEnd()

  const words = content.words.slice()
  for (const { word, index, tokens } of targets) {
    if (!tokens.length) {
      continue
    }
    const roman = makeWordAnnotationRoman({ language, tokens })
    words[index] = { ...word, annotation: makeWordAnnotation({ ...word.annotation, romans: [...(word.annotation?.romans ?? []), roman] }) }
  }
  const result = { ...line, content: { ...content, words } }
  const derived = deriveLineRomans(result.content).find((item) => lowerTag(item.language) === language)
  // Commit the whole track only when the model can reproduce its text, including separators.
  return derived?.text === source.text ? result : undefined
}

const readSources = (lines: runtime.Line[], options: AnnotationMatchOptions): AnnotationSource[] => {
  const result: AnnotationSource[] = []
  const preserve = options.preservePlaceholders
  for (const [index, line] of lines.entries()) {
    const start = line.time?.start
    const text = readText(line)
    const timing = options.getTiming?.(line)
    const precision = timing?.precision
    if ((start !== undefined && (preserve || text)) || (options.matchByOrder && text)) {
      result.push({
        line,
        index,
        text,
        start,
        precision: precision && Number.isFinite(precision) && precision > 0 ? precision : 1,
        rounding: timing?.rounding === 1 ? 1 : 0,
      })
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
    if (options.matchByOrder && line.type === LineType.NORMAL && readText(line)) {
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
  if (cached) {
    return cached
  }
  const buckets = new Map<number, TimeBucket>()
  for (const [target, start] of index.starts.entries()) {
    if (start === undefined || !Number.isFinite(start)) {
      continue
    }
    const key = Math.floor(start / precision)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { start, indices: [], mixed: false }
      buckets.set(key, bucket)
    }
    bucket.indices.push(target)
    bucket.mixed ||= bucket.start !== start
  }
  index.buckets.set(precision, buckets)
  return buckets
}

const matchDuplicates = (start: number, count: number, index: TimeIndex, groups: SourceGroups): AnnotationSource[] | undefined => {
  const result: AnnotationSource[] = []
  const collect = (precision: number, key: number, roundingOnly: boolean): boolean => {
    const queue = groups.get(precision)?.get(key)
    if (!queue) {
      return true
    }
    const bucket = getTimeBuckets(index, precision).get(key)
    if (bucket && (bucket.mixed || bucket.start !== start)) {
      return roundingOnly && queue.every((source) => source.rounding !== 1)
    }
    for (const source of queue) {
      const sourceStart = source.start!
      const rounded = source.rounding === 1
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

const matchAnnotations = (index: TimeIndex, sources: AnnotationSource[], options: AnnotationMatchOptions): Map<number, AnnotationSource> => {
  const matched = new Map<number, AnnotationSource>()
  if (!sources.length) {
    return matched
  }
  const preserve = options.preservePlaceholders
  const byStart = new Map<number, AnnotationSource[]>()
  for (const source of sources) {
    const start = source.start
    if (start === undefined || (preserve && !Number.isFinite(start))) {
      continue
    }
    const queue = byStart.get(start) ?? []
    queue.push(source)
    byStart.set(start, queue)
  }
  const usedSources = new Set<AnnotationSource>()
  const ambiguous = new Set<AnnotationSource>()
  const assign = (target: number, source: AnnotationSource) => {
    matched.set(target, source)
    usedSources.add(source)
  }

  for (const [start, queue] of index.targets) {
    const candidates = byStart.get(start)
    if (!candidates) {
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
      if (candidate.precision < source.precision) {
        source = candidate
      }
    }
    assign(queue[0]!, source)
  }
  if (usedSources.size === sources.length) {
    return matched
  }

  const readable = options.matchByOrder ? sources.filter((source) => source.text) : []
  if (readable.length && readable.length === index.lyricRows.length) {
    // Counts can agree after unrelated omissions, so row order must preserve exact matches.
    const compatible = readable.every((source, position) => {
      const target = index.lyricRows[position]!
      return (!matched.has(target) && !usedSources.has(source)) || matched.get(target) === source
    })
    if (compatible) {
      for (const [position, source] of readable.entries()) {
        if (!usedSources.has(source)) {
          assign(index.lyricRows[position]!, source)
        }
      }
      return matched
    }
  }

  if (preserve || options.getTiming) {
    const groups: SourceGroups = new Map()
    for (const source of sources) {
      const start = source.start
      if (usedSources.has(source) || start === undefined || !Number.isFinite(start)) {
        continue
      }
      const precision = source.precision
      let group = groups.get(precision)
      if (!group) {
        group = new Map()
        groups.set(precision, group)
      }
      const key = Math.floor(start / precision)
      const queue = group.get(key) ?? []
      queue.push(source)
      group.set(key, queue)
    }

    for (const [start, queue] of index.targets) {
      if (queue.length < 2 || matched.has(queue[0]!)) {
        continue
      }
      const candidates = matchDuplicates(start, queue.length, index, groups)
      if (!candidates || candidates.length !== queue.length) {
        continue
      }
      candidates.sort((first, second) => first.index - second.index)
      for (const [position, source] of candidates.entries()) {
        assign(queue[position]!, source)
      }
    }

    for (const precision of [...groups.keys()].sort((first, second) => first - second)) {
      const candidates = getTimeBuckets(index, precision)
      for (const [key, entries] of groups.get(precision)!) {
        const bucket = candidates.get(key)
        if (!bucket) {
          continue
        }
        const sourceQueue = entries.filter((source) => !usedSources.has(source))
        const targetQueue = bucket.indices.filter((target) => !matched.has(target))
        if (!sourceQueue.length || !targetQueue.length) {
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

    const rounding = new Map<AnnotationSource, number>()
    const claims = new Map<number, number>()
    for (const source of sources) {
      const start = source.start
      if (source.rounding !== 1 || usedSources.has(source) || ambiguous.has(source) || start === undefined || !Number.isFinite(start)) {
        continue
      }
      let target = -1
      let count = 0
      for (const neighbor of [start - 1, start + 1]) {
        for (const candidate of index.targets.get(neighbor) ?? []) {
          if (matched.has(candidate)) {
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

  const tolerance = options.tolerance ?? 0
  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    return matched
  }
  const ordered = (index.ordered ??= [...index.targets.keys()].filter(Number.isFinite).sort((first, second) => first - second))
  const cursors = new Map<number, number>()
  for (const source of sources) {
    const start = source.start
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
      while (cursor < queue.length && matched.has(queue[cursor]!)) {
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

const attachTracks = (
  lines: runtime.Line[],
  sources: AnnotationSources,
  options: AnnotationAttachOptions,
  wordTolerance?: number,
): runtime.Line[] => {
  if (!lines.length || (!sources.translations?.length && !sources.romans?.length)) {
    return lines
  }
  const index = createTimeIndex(lines, options)
  let result = lines
  // Tracks share timing lookups, but each owns its assignments so both can annotate the same row.
  for (const kind of ['translations', 'romans'] as const) {
    const matches = matchAnnotations(index, readSources(sources[kind] ?? [], options), options)
    for (const [target, source] of matches) {
      const line = result[target]!
      if (line.type === LineType.INSTRUMENTAL || !source.text) {
        continue
      }
      const romanLanguage = kind === 'romans' && wordTolerance !== undefined ? readRomanLanguage(source.line) : undefined
      let annotated =
        romanLanguage?.consistent && wordTolerance !== undefined
          ? attachWordRomans(line, source, wordTolerance, romanLanguage.language, options.wordFallback === true)
          : undefined
      if (!annotated) {
        const language = romanLanguage ? romanLanguage.language : source.line.languages[0]
        const create = kind === 'romans' ? makeLineAnnotationRoman : makeLineAnnotationTranslation
        const annotation = makeLineAnnotation({
          ...line.annotation,
          [kind]: [...(line.annotation?.[kind] ?? []), create({ text: source.text, language })],
        })
        annotated = { ...line, annotation }
      }
      if (result === lines) {
        result = lines.slice()
      }
      result[target] = annotated
    }
  }
  return result
}

/**
 * Attaches matched tracks as line annotations while preserving existing annotations and unchanged row identities.
 *
 * Reuses the original array when no visible annotations change.
 */
export const attachLineAnnotations = (lines: runtime.Line[], sources: AnnotationSources, options: AnnotationMatchOptions = {}): runtime.Line[] => {
  return attachTracks(lines, sources, options)
}

/**
 * Attaches complete roman tracks to words using timing and optional local recovery, retaining the source line when matching is incomplete.
 * Translations remain line-level, and successful word tracks are not duplicated on the line.
 *
 * Match before final normalization; original text and word timing are preserved.
 */
export const attachAnnotations = (lines: runtime.Line[], sources: AnnotationSources, options: AnnotationAttachOptions = {}): runtime.Line[] => {
  const tolerance = Number.isFinite(options.wordTolerance) ? Math.max(0, options.wordTolerance ?? 0) : 0
  return attachTracks(lines, sources, options, tolerance)
}
