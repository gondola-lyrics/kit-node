import type { runtime } from '@gondola-lyrics/model'

import { LineType, getWordsText, makeLineAnnotation, makeLineAnnotationRoman, makeLineAnnotationTranslation } from '@gondola-lyrics/model/runtime'

export interface AnnotationSources {
  translations?: runtime.Line[]
  romans?: runtime.Line[]
}

export interface AnnotationMatchOptions {
  /**
   * How far an annotation's start may sit from a line's start, in milliseconds.
   * Defaults to `0`, which requires an exact match.
   */
  tolerance?: number
}

/**
 * An annotation line carries its text in either field, depending on whether the track used word tags.
 */
const readText = (line: runtime.Line) => {
  return (line.content?.text ?? getWordsText(line.content?.words ?? [])).trim()
}

const isReadable = (line: runtime.Line) => {
  return line.time?.start !== undefined && readText(line) !== ''
}

/**
 * Assigns each annotation line to a lyric line index.
 *
 * Exact matches claim their lines first, so a fuzzy match never takes a line an exact one needed.
 * The remaining annotations take the nearest unclaimed line within the tolerance, and ties keep the earlier line.
 */
const matchEntries = (lines: runtime.Line[], annotations: runtime.Line[], tolerance: number) => {
  const matched = new Map<number, runtime.Line>()
  if (annotations.length === 0) {
    return matched
  }

  const starts = lines.map((line) => line.time?.start)
  const queues = new Map<number, number[]>()

  for (const [index, start] of starts.entries()) {
    if (start === undefined) {
      continue
    }
    const queue = queues.get(start)
    if (queue) {
      queue.push(index)
    } else {
      queues.set(start, [index])
    }
  }

  const used = new Set<number>()
  const pending: runtime.Line[] = []

  for (const annotation of annotations) {
    const start = annotation.time?.start
    if (start === undefined) {
      continue
    }
    const index = queues.get(start)?.shift()
    if (index === undefined) {
      pending.push(annotation)
      continue
    }
    matched.set(index, annotation)
    used.add(index)
  }

  if (tolerance <= 0) {
    return matched
  }

  for (const annotation of pending) {
    const start = annotation.time?.start
    if (start === undefined) {
      continue
    }

    let target = -1
    let distance = Number.POSITIVE_INFINITY

    for (const [index, lineStart] of starts.entries()) {
      if (lineStart === undefined || used.has(index)) {
        continue
      }
      const current = Math.abs(lineStart - start)
      // Only a strictly smaller distance wins, so equally distant lines keep the earlier one.
      if (current <= tolerance && current < distance) {
        target = index
        distance = current
      }
    }

    if (target !== -1) {
      matched.set(target, annotation)
      used.add(target)
    }
  }

  return matched
}

/**
 * Attaches annotation tracks to parsed lines by start time.
 *
 * Annotations that match nothing are dropped, and an instrumental line consumes its annotation without carrying one.
 * Any annotation already on a line is kept, with the matched track appended to its layer.
 */
export const attachLineAnnotations = (lines: runtime.Line[], sources: AnnotationSources, options: AnnotationMatchOptions = {}): runtime.Line[] => {
  // A negative or non-finite tolerance would make every comparison meaningless, so it degrades to exact matching.
  const tolerance = Number.isFinite(options.tolerance) ? Math.max(0, options.tolerance ?? 0) : 0

  const translations = matchEntries(lines, (sources.translations ?? []).filter(isReadable), tolerance)
  const romans = matchEntries(lines, (sources.romans ?? []).filter(isReadable), tolerance)
  if (translations.size === 0 && romans.size === 0) {
    return lines
  }

  return lines.map((line, index) => {
    const translation = translations.get(index)
    const roman = romans.get(index)

    // An instrumental line has no singing to annotate, and the model rejects annotation on one.
    if (line.type === LineType.INSTRUMENTAL || (translation === undefined && roman === undefined)) {
      return line
    }

    return {
      ...line,
      annotation: makeLineAnnotation({
        romans: [
          ...(line.annotation?.romans ?? []),
          ...(roman === undefined ? [] : [makeLineAnnotationRoman({ text: readText(roman), language: roman.languages[0] })]),
        ],
        translations: [
          ...(line.annotation?.translations ?? []),
          ...(translation === undefined ? [] : [makeLineAnnotationTranslation({ text: readText(translation), language: translation.languages[0] })]),
        ],
      }),
    }
  })
}
