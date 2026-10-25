import type { runtime } from '@gondola-lyrics/model'

import { LineType, Timing, makeLineInstrumental, makeTimeRange, validateTimeRange } from '@gondola-lyrics/model/runtime'

export interface InsertInstrumentalLinesOptions {
  /**
   * Minimum gap duration in milliseconds, including an outro.
   *
   * @default 10000
   */
  minDuration?: number
  /**
   * Minimum gap duration before the first vocal in milliseconds.
   *
   * @default 5000
   */
  minIntroDuration?: number
  /**
   * Outro boundary in milliseconds, measured on the same timeline as line ranges.
   * An omitted boundary leaves the outro unknown.
   */
  endTime?: number
}

const MAX_TIME = 2 ** 31 - 1

const readMinimum = (value: number | undefined, fallback: number, name: string): number => {
  const minimum = value ?? fallback
  if (!Number.isSafeInteger(minimum) || minimum < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer in milliseconds`)
  }
  return minimum
}

const readEndTime = (value: number | undefined): number | undefined => {
  if (value !== undefined && (!Number.isInteger(value) || value < 0 || value > MAX_TIME)) {
    throw new RangeError(`endTime must be a non-negative integer in milliseconds no greater than ${MAX_TIME}`)
  }
  return value
}

const compareTimeRanges = (left: runtime.TimeRange | undefined, right: runtime.TimeRange | undefined): number => {
  const leftStart = left?.start ?? Infinity
  const rightStart = right?.start ?? Infinity
  if (leftStart !== rightStart) {
    return leftStart - rightStart
  }

  const leftEnd = left?.end ?? Infinity
  const rightEnd = right?.end ?? Infinity
  return leftEnd === rightEnd ? 0 : leftEnd - rightEnd
}

const readOccupiedTimeline = (lyric: runtime.Lyric) => {
  const ranges: runtime.TimeRange[] = []
  let firstSungStart = Infinity

  const append = (time: runtime.TimeRange | undefined, sung: boolean): boolean => {
    if (time === undefined || validateTimeRange(time).length > 0) {
      return false
    }

    // An empty half-open range cannot divide an uncovered gap.
    if (time.end === time.start) {
      return true
    }
    ranges.push(time)
    if (sung) {
      firstSungStart = Math.min(firstSungStart, time.start)
    }
    return true
  }

  for (const line of lyric.lines) {
    if (!append(line.time, line.type === LineType.NORMAL)) {
      return undefined
    }
    for (const background of line.backgrounds) {
      if (!append(background.time, true)) {
        return undefined
      }
    }
  }

  ranges.sort(compareTimeRanges)
  return { ranges, firstSungStart }
}

const compareLineTimes = (left: runtime.Line, right: runtime.Line): number => {
  return compareTimeRanges(left.time, right.time)
}

const mergeLines = (lines: runtime.Line[], inserted: runtime.Line[]): runtime.Line[] => {
  let source = lines
  for (const [index, line] of lines.entries()) {
    const previous = lines[index - 1]
    if (previous !== undefined && compareLineTimes(previous, line) > 0) {
      source = [...lines].sort(compareLineTimes)
      break
    }
  }

  const merged: runtime.Line[] = []
  let nextIndex = 0
  for (const line of source) {
    let next = inserted[nextIndex]
    while (next !== undefined && compareLineTimes(next, line) < 0) {
      merged.push(next)
      nextIndex += 1
      next = inserted[nextIndex]
    }
    merged.push(line)
  }
  merged.push(...inserted.slice(nextIndex))
  return merged
}

/**
 * Inserts derived instrumental lines into uncovered gaps on the stored timeline, starting at zero.
 * Existing lines and background vocals occupy their full ranges; an unknown end blocks later gaps.
 *
 * An outro requires an explicit endTime; metadata duration and offset do not affect insertion.
 *
 * @returns The input when unchanged, or a new lyric and lines array sharing existing nodes.
 */
export const insertInstrumentalLines = (lyric: runtime.Lyric, options: InsertInstrumentalLinesOptions = {}): runtime.Lyric => {
  const minDuration = readMinimum(options.minDuration, 10000, 'minDuration')
  const minIntroDuration = readMinimum(options.minIntroDuration, 5000, 'minIntroDuration')
  const endTime = readEndTime(options.endTime)
  if ((lyric.timing !== Timing.LINE && lyric.timing !== Timing.WORD) || lyric.lines.length === 0) {
    return lyric
  }

  const occupied = readOccupiedTimeline(lyric)
  if (!occupied || occupied.firstSungStart === Infinity) {
    return lyric
  }

  const inserted: runtime.Line[] = []
  let coveredEnd = 0

  const appendGap = (end: number, minimum: number): void => {
    const duration = end - coveredEnd
    if (duration > 0 && duration >= minimum) {
      inserted.push(makeLineInstrumental({ time: makeTimeRange({ start: coveredEnd, end }) }))
    }
  }

  for (const range of occupied.ranges) {
    appendGap(range.start, range.start <= occupied.firstSungStart ? minIntroDuration : minDuration)
    // An unknown end gives no evidence of a later gap, so it occupies the rest of the timeline.
    coveredEnd = Math.max(coveredEnd, range.end ?? Infinity)
    if (coveredEnd === Infinity) {
      break
    }
  }

  if (endTime !== undefined) {
    appendGap(endTime, minDuration)
  }

  if (inserted.length === 0) {
    return lyric
  }
  return { ...lyric, lines: mergeLines(lyric.lines, inserted) }
}
