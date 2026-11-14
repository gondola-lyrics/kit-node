import type {
  EnrichedLine,
  EnrichedLineAnnotation,
  EnrichedLineAnnotationRoman,
  EnrichedLineAnnotationTranslation,
  EnrichedLineBackground,
  EnrichedLineContent,
  EnrichedLyric,
  EnrichedWord,
  TimeRange,
} from '@gondola-lyrics/model'
import type { ContentRange } from './utils'

import {
  EnrichedLineType,
  deriveEnrichedLanguageUsages,
  getEnrichedLineAnnotationRomanText,
  makeEnrichedLineAnnotation,
  makeEnrichedLineBackground,
  makeTimeRange,
} from '@gondola-lyrics/model'

import {
  canSliceRoman,
  hasVisibleText,
  isCloseBracket,
  isNormalWord,
  isOpenBracket,
  preserveAnnotationTime,
  readLineText,
  resolveTiming,
  sliceContents,
  sliceRoman,
  sliceTranslation,
} from './utils'

export interface ExtractBackgroundLinesOptions {
  /**
   * Move fully bracketed lines to the preceding lead when all source fields can be retained.
   *
   * @default true
   */
  fullLine?: boolean
  /**
   * Extract bracketed runs within a line, preserving unmatched annotation text.
   *
   * @default true
   */
  inLine?: boolean
  /**
   * Recognize a bracket spanning two adjacent lines and retain each source as a separate background.
   *
   * @default true
   */
  crossLine?: boolean
}

interface BracketRun extends ContentRange {
  slot: number
}

interface BackgroundRun {
  run: BracketRun
  background: EnrichedLineBackground
}

/**
 * Offsets use UTF-16 throughout so supplementary characters cannot shift content or annotation slices.
 */
const readRuns = (text: string): BracketRun[] | null => {
  const runs: BracketRun[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < text.length; index += 1) {
    const character = text.charAt(index)
    if (isOpenBracket(character)) {
      if (depth === 0) {
        start = index + 1
      }
      depth += 1
    } else if (isCloseBracket(character)) {
      if (depth === 0) {
        return null
      }
      depth -= 1
      if (depth === 0) {
        runs.push({ start, end: index, slot: runs.length })
      }
    }
  }
  return depth === 0 ? runs : null
}

const remainingRanges = (text: string, runs: BracketRun[]): ContentRange[] => {
  const ranges: ContentRange[] = []
  let cursor = 0
  for (const run of runs) {
    if (cursor < run.start - 1) {
      ranges.push({ start: cursor, end: run.start - 1 })
    }
    cursor = run.end + 1
  }
  if (cursor < text.length) {
    ranges.push({ start: cursor, end: text.length })
  }

  while (ranges.length) {
    const first = ranges[0]!
    while (first.start < first.end && !hasVisibleText(text.charAt(first.start))) {
      first.start += 1
    }
    if (first.start < first.end) {
      break
    }
    ranges.shift()
  }
  while (ranges.length) {
    const last = ranges.at(-1)!
    while (last.end > last.start && !hasVisibleText(text.charAt(last.end - 1))) {
      last.end -= 1
    }
    if (last.end > last.start) {
      break
    }
    ranges.pop()
  }
  return ranges
}

const hasRemainingText = (text: string, runs: BracketRun[]): boolean => {
  return remainingRanges(text, runs).some((range) => hasVisibleText(text.slice(range.start, range.end)))
}

const readWordRange = (words: EnrichedWord[], fallback: TimeRange | undefined): TimeRange | null => {
  let start = Infinity
  let end = 0
  for (const word of words) {
    if (!isNormalWord(word) || !word.time) {
      continue
    }
    start = Math.min(start, word.time.start)
    end = Math.max(end, word.time.end ?? Infinity)
  }
  return start === Infinity ? (fallback ?? null) : makeTimeRange({ start, end: end === Infinity ? undefined : end })
}

const mapSpan = (range: TimeRange | undefined, text: string, run: BracketRun): TimeRange | null => {
  if (!range || range.end === undefined) {
    return range ?? null
  }
  const length = [...text].length
  const span = range.end - range.start
  const start = range.start + Math.round((span * [...text.slice(0, run.start)].length) / length)
  const end = range.start + Math.round((span * [...text.slice(0, run.end)].length) / length)
  return makeTimeRange({ start, end: Math.max(start, end) })
}

/**
 * A background inherits its parent's section, so a different source declaration must remain a lead line.
 */
const canMovePart = (source: EnrichedLine, parent: EnrichedLine): boolean => {
  const part = source.part
  return !part || (part.type === parent.part?.type && (part.id ?? '') === (parent.part.id ?? '') && (part.raw ?? '') === (parent.part.raw ?? ''))
}

const makeBackground = (
  source: EnrichedLine,
  content: EnrichedLineContent,
  whole: boolean,
  time: TimeRange | null = source.time ?? null,
): EnrichedLineBackground => {
  return makeEnrichedLineBackground({
    id: whole ? source.id : '',
    time: time ?? undefined,
    agentIds: source.agentIds,
    languages: source.languages,
    content,
    annotation: whole ? source.annotation : undefined,
  })
}

/**
 * Only newly attached backgrounds affect the range; unknown ends are never shortened or guessed.
 */
const attach = (line: EnrichedLine, backgrounds: EnrichedLineBackground[], canOpen: boolean): EnrichedLine | null => {
  const merged = [...line.backgrounds, ...backgrounds]
  merged.sort((first, second) => (first.time?.start ?? Infinity) - (second.time?.start ?? Infinity))

  let time = line.time
  if (time) {
    let end = time.end ?? Infinity
    for (const background of merged) {
      if (background.time) {
        end = Math.max(end, background.time.end ?? Infinity)
      }
    }
    if (end === Infinity && !canOpen) {
      return null
    }
    const finish = end === Infinity ? undefined : end
    if (finish !== time.end) {
      time = makeTimeRange({ start: time.start, end: finish })
    }
  }
  return { ...line, time, annotation: preserveAnnotationTime(line, time) ?? undefined, backgrounds: merged }
}

/**
 * Source slots include empty pairs so an empty annotation cannot shift later background assignments.
 * Draft backgrounds are owned by the caller and discarded together when a split cannot retain its timing.
 */
const splitAnnotation = (line: EnrichedLine, backgrounds: BackgroundRun[]): { annotation: EnrichedLineAnnotation | null } | null => {
  const annotation = line.annotation
  if (!annotation) {
    return { annotation: null }
  }
  const targets = new Map(backgrounds.map(({ run, background }) => [run.slot, background]))
  let changed = false
  const move = <Item extends EnrichedLineAnnotationRoman | EnrichedLineAnnotationTranslation>(
    items: Item[],
    read: (item: Item) => string,
    slice: (item: Item, ranges: ContentRange[], time: TimeRange | undefined) => Item | null,
    append: (background: EnrichedLineBackground, item: Item) => void,
    canSlice: ((item: Item, selections: ContentRange[][]) => boolean) | null = null,
  ): Item[] | null => {
    const remaining: Item[] = []
    for (const item of items) {
      const text = read(item)
      const runs = readRuns(text)
      const matched = runs?.filter((run) => targets.has(run.slot) && hasVisibleText(text.slice(run.start, run.end))) ?? []
      if (!matched.length) {
        remaining.push(item)
        continue
      }
      const main = remainingRanges(text, matched)
      if (canSlice && !canSlice(item, [main, ...matched.map((run) => [run])])) {
        return null
      }
      // Empty main text is a successful move; a failed slice of visible text must keep the source.
      if (main.some((range) => hasVisibleText(text.slice(range.start, range.end)))) {
        const retained = slice(item, main, line.time)
        if (retained === null) {
          return null
        }
        remaining.push(retained)
      }
      for (const run of matched) {
        const background = targets.get(run.slot)!
        const selected = slice(item, [run], background.time)
        if (selected === null) {
          return null
        }
        append(background, selected)
      }
      changed = true
    }
    return remaining
  }

  const romans = move(
    annotation.romans,
    getEnrichedLineAnnotationRomanText,
    (item, ranges, time) => sliceRoman(item, ranges, line, time),
    (background, item) => {
      background.annotation ??= makeEnrichedLineAnnotation()
      background.annotation.romans.push(item)
    },
    canSliceRoman,
  )
  if (!romans) {
    return null
  }
  const translations = move(
    annotation.translations,
    (item) => item.text,
    (item, ranges) => sliceTranslation(item, ranges),
    (background, item) => {
      background.annotation ??= makeEnrichedLineAnnotation()
      background.annotation.translations.push(item)
    },
  )
  if (!translations) {
    return null
  }
  return {
    annotation: !changed ? annotation : romans.length || translations.length ? { ...annotation, romans, translations } : null,
  }
}

const readFullBackgrounds = (line: EnrichedLine, runs: BracketRun[]): EnrichedLineBackground[] | null => {
  const text = readLineText(line)
  const visible = runs.filter((run) => hasVisibleText(text.slice(run.start, run.end)))
  if (!visible.length || (visible.length > 1 && line.id)) {
    return null
  }
  const contents = sliceContents(
    line.content!,
    visible.map((run) => [run]),
  )
  if (!contents || contents.some((content) => !content)) {
    return null
  }
  if (visible.length === 1) {
    return [makeBackground(line, contents[0]!, true), ...line.backgrounds]
  }
  const backgrounds = visible.map((run, index) => {
    return { run, background: makeBackground(line, contents[index]!, false) }
  })
  const split = splitAnnotation(line, backgrounds)
  if (!split || split.annotation) {
    return null
  }
  return [...backgrounds.map((entry) => entry.background), ...line.backgrounds]
}

const readInline = (line: EnrichedLine, runs: BracketRun[], canOpen: boolean): EnrichedLine | null => {
  const text = readLineText(line)
  const visible = runs.filter((run) => hasVisibleText(text.slice(run.start, run.end)))
  if (!visible.length) {
    return null
  }
  const selections = [remainingRanges(text, visible), ...visible.map((run) => [run])]
  const contents = sliceContents(line.content!, selections)
  const main = contents?.[0] ?? null
  if (!contents || !main) {
    return null
  }
  const backgrounds: BackgroundRun[] = []
  for (const [index, run] of visible.entries()) {
    const content = contents[index + 1] ?? null
    if (!content) {
      return null
    }
    const time = content.words.length ? readWordRange(content.words, line.time) : mapSpan(line.time, text, run)
    backgrounds.push({ run, background: makeBackground(line, content, false, time) })
  }
  const split = splitAnnotation(line, backgrounds)
  if (!split) {
    return null
  }
  return attach(
    { ...line, content: main, annotation: split.annotation ?? undefined },
    backgrounds.map((entry) => entry.background),
    canOpen,
  )
}

const isBracketOnlyLine = (line: EnrichedLine): boolean => {
  if (line.type !== EnrichedLineType.NORMAL) {
    return false
  }
  const text = readLineText(line)
  const runs = readRuns(text)
  return !!runs?.length && !hasRemainingText(text, runs)
}

const findParentIndex = (lines: EnrichedLine[]): number => {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!
    if (line.type === EnrichedLineType.NORMAL && !isBracketOnlyLine(line)) {
      return index
    }
  }
  return -1
}

const readCrossRanges = (line: EnrichedLine, next: EnrichedLine): [ContentRange, ContentRange] | null => {
  if (line.type !== EnrichedLineType.NORMAL || next.type !== EnrichedLineType.NORMAL || !line.content || !next.content) {
    return null
  }
  const first = readLineText(line)
  const second = readLineText(next)
  const text = first + second
  const runs = readRuns(text)
  const run = runs?.[0] ?? null
  if (!run || runs?.length !== 1 || run.start > first.length || run.end < first.length || hasRemainingText(text, runs)) {
    return null
  }
  return [
    { start: run.start, end: first.length },
    { start: 0, end: run.end - first.length },
  ]
}

const moveCrossLines = (
  parent: EnrichedLine,
  line: EnrichedLine,
  next: EnrichedLine,
  ranges: [ContentRange, ContentRange],
  canOpen: boolean,
): EnrichedLine | null => {
  if (!canMovePart(line, parent) || !canMovePart(next, parent)) {
    return null
  }
  const first = sliceContents(line.content!, [[ranges[0]]])?.[0] ?? null
  const second = sliceContents(next.content!, [[ranges[1]]])?.[0] ?? null
  if (!first || !second) {
    return null
  }
  const backgrounds = [makeBackground(line, first, true), ...line.backgrounds, makeBackground(next, second, true), ...next.backgrounds]
  return attach(parent, backgrounds, canOpen)
}

/**
 * Extracts bracketed vocals without discarding source words, annotations, identities, or background lines.
 *
 * Fully bracketed lines move only when every field can be retained; ambiguous splits leave their sources unchanged.
 * A pair spanning two adjacent lines yields two backgrounds with their original ranges and annotations.
 * Unknown ends remain open, and existing roman timing survives any extension of the parent line.
 *
 * @returns The input when unchanged, or a new lyric sharing all unchanged nodes.
 */
export const extractBackgroundLines = (lyric: EnrichedLyric, options: ExtractBackgroundLinesOptions = {}): EnrichedLyric => {
  const fullLine = options.fullLine ?? true
  const inLine = options.inLine ?? true
  const crossLine = options.crossLine ?? true
  if (!lyric.lines.length || (!fullLine && !inLine && !crossLine)) {
    return lyric
  }

  const lines: EnrichedLine[] = []
  let changed = false
  for (let index = 0; index < lyric.lines.length; index += 1) {
    const line = lyric.lines[index]!
    if (line.type !== EnrichedLineType.NORMAL || !line.content) {
      lines.push(line)
      continue
    }
    const parentIndex = findParentIndex(lines)
    const parent = lines[parentIndex] ?? null
    const next = lyric.lines[index + 1] ?? null
    const cross = crossLine && next ? readCrossRanges(line, next) : null
    if (cross && next && parent) {
      const canOpen = index + 2 === lyric.lines.length && parentIndex === lines.length - 1
      const moved = moveCrossLines(parent, line, next, cross, canOpen)
      if (moved) {
        lines[parentIndex] = moved
        changed = true
      } else {
        lines.push(line, next)
      }
      index += 1
      continue
    }

    const text = readLineText(line)
    const runs = readRuns(text)
    if (!runs?.length) {
      lines.push(line)
      continue
    }
    if (!hasRemainingText(text, runs)) {
      const backgrounds = fullLine && parent && canMovePart(line, parent) ? readFullBackgrounds(line, runs) : null
      const canOpen = index + 1 === lyric.lines.length && parentIndex === lines.length - 1
      const moved = parent && backgrounds ? attach(parent, backgrounds, canOpen) : null
      if (moved) {
        lines[parentIndex] = moved
        changed = true
      } else {
        lines.push(line)
      }
      continue
    }
    const extracted = inLine ? readInline(line, runs, index + 1 === lyric.lines.length) : null
    lines.push(extracted ?? line)
    changed ||= !!extracted
  }

  return changed ? { ...lyric, lines, timing: resolveTiming(lyric, lines), languageUsages: deriveEnrichedLanguageUsages(lines) } : lyric
}
