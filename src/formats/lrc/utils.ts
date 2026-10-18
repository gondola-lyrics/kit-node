import { isTime, parseTime } from '@root/utils'

const WORD_OFFSET_PATTERN = /^(\d+)(?:,(\d+))?$/

const WORD_CLOCK_DURATION_PATTERN = /^([^,]+),(\d+)$/

const WORD_TAG_PATTERN = /<([^>]*)>/g

export const TAG_PATTERN = /\[([^\]]*)\]/g

export const META_PATTERN = /^([A-Za-z0-9_-]+)\s*:\s*([\s\S]*)$/

/**
 * Integer tags use `offset[,duration]` in milliseconds relative to the line start.
 * Clock tags are absolute and may append a duration in milliseconds, as in `<00:01.50,500>`.
 * A missing or zero duration leaves the word end unspecified.
 */
export const parseWordTime = (body: string, lineStart: number) => {
  if (isTime(body)) {
    const start = parseTime(body)

    return start === undefined ? undefined : { start, end: undefined }
  }

  const match = WORD_OFFSET_PATTERN.exec(body.trim())
  if (match) {
    const start = lineStart + Number(match[1])
    const duration = Number(match[2] ?? 0)

    return { start, end: duration > 0 ? start + duration : undefined }
  }

  const clock = WORD_CLOCK_DURATION_PATTERN.exec(body.trim())
  if (clock && isTime(clock[1] ?? '')) {
    const start = parseTime(clock[1] ?? '')
    const duration = Number(clock[2] ?? 0)

    return start === undefined ? undefined : { start, end: duration > 0 ? start + duration : undefined }
  }

  return undefined
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
 * A trailing tag still yields an empty piece so it can close the preceding word.
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
  } else if (tag !== undefined) {
    pieces.push({ text: '', tag })
  }

  return pieces
}
