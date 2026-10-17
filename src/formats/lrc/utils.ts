import { makeTimeRange, makeWordNormal, makeWordSpace } from '@gondola-lyrics/model/runtime'

import { isTime, parseTime } from '@root/utils'

const WORD_OFFSET_PATTERN = /^(\d+)(?:,(\d+))?$/

const WORD_TAG_PATTERN = /<([^>]*)>/g

export const TAG_PATTERN = /\[([^\]]*)\]/g

export const META_PATTERN = /^([A-Za-z0-9_-]+)\s*:\s*([\s\S]*)$/

/**
 * Integer tags use `offset[,duration]` in milliseconds relative to the line start; clock tags are absolute.
 * A missing or zero duration leaves the word end unspecified.
 */
export const parseWordTime = (body: string, lineStart: number) => {
  if (isTime(body)) {
    const start = parseTime(body)

    return start === undefined ? undefined : { start, end: undefined }
  }

  const match = WORD_OFFSET_PATTERN.exec(body.trim())
  if (!match) {
    return undefined
  }

  const start = lineStart + Number(match[1])
  const duration = Number(match[2] ?? 0)

  return { start, end: duration > 0 ? start + duration : undefined }
}

/**
 * Tags precede their text, as in `<0,500>hel`.
 */
export interface WordPiece {
  text: string
  tag?: string
}

/**
 * Untagged leading text is preserved; tags without following text produce no piece.
 */
export const splitWordTags = (content: string) => {
  const pieces: WordPiece[] = []
  let tag: string | undefined
  let cursor = 0

  for (const match of content.matchAll(WORD_TAG_PATTERN)) {
    const at = match.index
    const before = content.slice(cursor, at)

    if (before) {
      pieces.push({ text: before, tag })
    }

    tag = match[1] ?? ''
    cursor = at + match[0].length
  }

  const tail = content.slice(cursor)
  if (tail) {
    pieces.push({ text: tail, tag })
  }

  return pieces
}

/**
 * Empty strings also count as whitespace-only text.
 */
export const isBlank = (text: string) => {
  return text.trim() === ''
}

/**
 * Missing starts omit the range instead of inventing a word timestamp.
 */
export const makeWord = (text: string, start?: number, end?: number) => {
  const time = start === undefined ? undefined : makeTimeRange({ start, end })

  return makeWordNormal({ text, time })
}

/**
 * Separators use one ASCII space regardless of the source whitespace.
 */
export const makeSpace = () => {
  return makeWordSpace({ text: ' ' })
}
