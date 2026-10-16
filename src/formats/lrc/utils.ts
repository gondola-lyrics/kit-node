import { makeTimeRange, makeWordNormal, makeWordSpace } from '@gondola-lyrics/model/runtime'

import { isTime, parseTime } from '@root/utils'

const WORD_OFFSET_PATTERN = /^(\d+)(?:,(\d+))?$/

const WORD_TAG_PATTERN = /<([^>]*)>/g

export const TAG_PATTERN = /\[([^\]]*)\]/g

export const META_PATTERN = /^([A-Za-z0-9_-]+)\s*:\s*([\s\S]*)$/

/**
 * Reads a word's own timing tag: a time, or a millisecond offset from the line's own time with an optional duration after a comma.
 * A bare number is the offset, since `<500>` states half a second past the line's time rather than a point on the clock.
 * A zero duration leaves the end open, since the tag stated only where the word starts.
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
 * A run of a line's text and the timing tag that times it, if any.
 * A tag stands before the word it times, as in `<0,500>hel`.
 */
export interface WordPiece {
  text: string
  tag?: string
}

/**
 * Splits a line's content into the runs of text it carries, each with the tag standing before it.
 * Text the line opens with is the first run and carries no tag; a tag with nothing after it times no word and is dropped.
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
 * Whether a run of text is whitespace only, so it separates words rather than being one.
 */
export const isBlank = (text: string) => {
  return text.trim() === ''
}

/**
 * Builds a normal word, carrying a time range only when the text stated one.
 */
export const makeWord = (text: string, start?: number, end?: number) => {
  const time = start === undefined ? undefined : makeTimeRange({ start, end })

  return makeWordNormal({ text, time })
}

/**
 * Builds a space word, the separator between two words.
 */
export const makeSpace = () => {
  return makeWordSpace({ text: ' ' })
}
