import type { runtime } from '@gondola-lyrics/model'

import { WordType, makeTimeRange } from '@gondola-lyrics/model/runtime'

const OPEN_BRACKETS = new Set(['(', '（'])
const CLOSE_BRACKETS = new Set([')', '）'])

export const isOpenBracket = (char: string) => {
  return OPEN_BRACKETS.has(char)
}

export const isCloseBracket = (char: string) => {
  return CLOSE_BRACKETS.has(char)
}

export const isNormalWord = (word: runtime.Word) => {
  return word.type === WordType.NORMAL
}

/**
 * Content carries plain text or words, never both, so exactly one of the two is read.
 */
export const readLineText = (line: runtime.Line) => {
  return line.content?.text ?? (line.content?.words ?? []).map((word) => word.text).join('')
}

export const readTimeRange = (line: runtime.Line) => {
  return line.time ? makeTimeRange({ start: line.time.start, end: line.time.end }) : undefined
}
