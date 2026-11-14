import type {
  EnrichedLine,
  EnrichedLineAnnotation,
  EnrichedLineAnnotationRoman,
  EnrichedLineAnnotationTranslation,
  EnrichedLineContent,
  EnrichedLyric,
  EnrichedWord,
  TextToken,
  TimeRange,
} from '@gondola-lyrics/model'

import {
  EnrichedWordType,
  TimingLevel,
  hasEnrichedLineWords,
  resolveEnrichedLineAnnotationRomanTime,
  resolveEnrichedLineAnnotationRomanTokenTime,
} from '@gondola-lyrics/model'

import { mapShared } from '@root/utils'

const OPEN_BRACKETS = new Set(['(', '（'])
const CLOSE_BRACKETS = new Set([')', '）'])
const VISIBLE_TEXT = /[^\p{White_Space}\uFEFF]/u

export interface ContentRange {
  start: number
  end: number
}

/**
 * Accepts either bracket spelling used by the background transforms.
 */
export const isOpenBracket = (char: string) => {
  return OPEN_BRACKETS.has(char)
}

/**
 * Accepts either closing bracket spelling without requiring a matching width.
 */
export const isCloseBracket = (char: string) => {
  return CLOSE_BRACKETS.has(char)
}

/**
 * Excludes structural separators when reading sung words.
 */
export const isNormalWord = (word: EnrichedWord) => {
  return word.type === EnrichedWordType.NORMAL
}

/**
 * Content carries plain text or words, never both, so exactly one of the two is read.
 */
export const readLineText = (line: EnrichedLine) => {
  return line.content?.text ?? (line.content?.words ?? []).map((word) => word.text).join('')
}

/**
 * Uses the same Unicode whitespace set for text and word content.
 */
export const hasVisibleText = (text: string): boolean => {
  return VISIBLE_TEXT.test(text)
}

/**
 * Keeps word metadata attached to a single surviving fragment while selecting UTF-16 source ranges.
 * A null result rejects a destructive split; null entries mark empty destinations.
 */
export const sliceContents = (content: EnrichedLineContent, selections: ContentRange[][]): (EnrichedLineContent | null)[] | null => {
  if (content.text !== undefined) {
    return selections.map((ranges) => {
      const text = ranges.map((range) => content.text!.slice(range.start, range.end)).join('')
      return hasVisibleText(text) ? (text === content.text ? content : { ...content, text }) : null
    })
  }

  let offset = 0
  const groups: EnrichedWord[][] = selections.map(() => [])
  for (const word of content.words) {
    const start = offset
    offset += word.text.length
    let destinations = 0
    for (const [index, ranges] of selections.entries()) {
      let text = ''
      for (const range of ranges) {
        const from = Math.max(start, range.start)
        const to = Math.min(offset, range.end)
        if (from < to) {
          text += word.text.slice(from - start, to - start)
        }
      }
      if (text) {
        destinations += 1
        groups[index]!.push(text === word.text ? word : { ...word, text })
      }
    }
    if (destinations === 0 && (word.annotation || word.emphasis || word.language)) {
      return null
    }
    if (destinations > 1 && word.annotation) {
      return null
    }
  }

  return groups.map((words) => {
    if (!words.some((word) => isNormalWord(word) && hasVisibleText(word.text))) {
      return null
    }
    const unchanged = words.length === content.words.length && words.every((word, index) => word === content.words[index])
    return unchanged ? content : { ...content, words }
  })
}

/**
 * Word timing remains present when any lead or background still contains words.
 */
export const resolveTiming = (lyric: EnrichedLyric, lines: EnrichedLine[]): EnrichedLyric['timing'] => {
  if (lyric.timing !== TimingLevel.WORD) {
    return lyric.timing
  }

  const wordLevel = lines.some((line) => hasEnrichedLineWords(line) || line.backgrounds.some(hasEnrichedLineWords))
  return wordLevel ? TimingLevel.WORD : TimingLevel.LINE
}

const sameTime = (first: TimeRange | undefined, second: TimeRange | undefined): boolean => {
  return first === second || (!!first && !!second && first.start === second.start && first.end === second.end)
}

/**
 * Pins inherited fragments before their owner changes range without restricting independent explicit token times.
 */
export const preserveRomanTime = (roman: EnrichedLineAnnotationRoman, source: Pick<EnrichedLine, 'time'>, target: TimeRange | undefined) => {
  if (roman.time || sameTime(source.time, target)) {
    return roman
  }

  const content = roman.content
  if (!content?.tokens.length) {
    const time = resolveEnrichedLineAnnotationRomanTime(roman, source)
    return time ? { ...roman, time } : roman
  }

  const tokens = mapShared(content.tokens, (token) => {
    if (token.time) {
      return token
    }
    const time = resolveEnrichedLineAnnotationRomanTokenTime(token, roman, source)
    return time ? { ...token, time } : token
  })
  return tokens === content.tokens ? roman : { ...roman, content: { ...content, tokens } }
}

/**
 * Preserves existing roman timing when a lead line grows to contain a newly attached background.
 */
export const preserveAnnotationTime = (line: EnrichedLine, target: TimeRange | undefined): EnrichedLineAnnotation | null => {
  const annotation = line.annotation
  if (!annotation || sameTime(line.time, target)) {
    return annotation ?? null
  }

  const romans = mapShared(annotation.romans, (roman) => preserveRomanTime(roman, line, target))
  return romans === annotation.romans ? annotation : { ...annotation, romans }
}

const readRanges = (text: string, ranges: ContentRange[]): string => {
  return ranges.map((range) => text.slice(range.start, range.end)).join('')
}

/**
 * A removed delimiter may carry source attributes that have no surviving fragment to own them.
 */
export const canSliceRoman = (roman: EnrichedLineAnnotationRoman, selections: ContentRange[][]): boolean => {
  let offset = 0
  for (const token of roman.content?.tokens ?? []) {
    const start = offset
    offset += token.text.length
    if (!Object.keys(token.extra).length) {
      continue
    }
    const retained = selections.some((ranges) => {
      return ranges.some((range) => Math.max(start, range.start) < Math.min(offset, range.end))
    })
    if (!retained) {
      return false
    }
  }
  return true
}

/**
 * Keeps source token boundaries and attributes while removing only selected bracket characters.
 * Empty selections and selections requiring invented token times return null.
 */
export const sliceRoman = (
  roman: EnrichedLineAnnotationRoman,
  ranges: ContentRange[],
  source: Pick<EnrichedLine, 'time'>,
  target: TimeRange | undefined,
): EnrichedLineAnnotationRoman | null => {
  const content = roman.content
  if (!content) {
    return null
  }

  if (content.text !== undefined) {
    const text = readRanges(content.text, ranges)
    if (!hasVisibleText(text)) {
      return null
    }
    const selected = text === content.text ? roman : { ...roman, content: { ...content, text } }
    return preserveRomanTime(selected, source, target)
  }

  let offset = 0
  let tokens: TextToken[] = []
  for (const token of content.tokens) {
    const start = offset
    offset += token.text.length
    const selected = ranges.flatMap((range) => {
      const from = Math.max(start, range.start)
      const to = Math.min(offset, range.end)
      return from < to ? [{ start: from - start, end: to - start }] : []
    })
    const text = readRanges(token.text, selected)
    if (text) {
      tokens.push(text === token.text ? token : { ...token, text })
    }
  }

  if (!hasVisibleText(tokens.map((token) => token.text).join(''))) {
    return null
  }

  if (!tokens.some((token) => token.time)) {
    tokens = mapShared(tokens, (token) => {
      const time = resolveEnrichedLineAnnotationRomanTokenTime(token, roman, source)
      return time ? { ...token, time } : token
    })
    if (!tokens.some((token) => token.time)) {
      return null
    }
  }

  const unchanged = tokens.length === content.tokens.length && tokens.every((token, index) => token === content.tokens[index])
  const selected = unchanged ? roman : { ...roman, content: { ...content, tokens } }
  return preserveRomanTime(selected, source, target)
}

/**
 * Retains literal unselected translation spans and any attributes of the source entry.
 */
export const sliceTranslation = (
  translation: EnrichedLineAnnotationTranslation,
  ranges: ContentRange[],
): EnrichedLineAnnotationTranslation | null => {
  const text = readRanges(translation.text, ranges)
  return hasVisibleText(text) ? (text === translation.text ? translation : { ...translation, text }) : null
}
