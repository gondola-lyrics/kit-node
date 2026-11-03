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
 * A recognized tag precedes its text; a missing tag identifies the literal prefix.
 */
export interface WordPiece {
  text: string
  tag?: string
}

/**
 * Splits recognized tags from their following text while preserving literal content and empty tagged segments.
 *
 * @param pattern A global pattern whose first capture is the tag body.
 * @param accepts Optional format-specific tag validation.
 *
 * @returns Source pieces in their original order, including an untagged prefix when present.
 */
export const scanWordTags = (content: string, pattern: RegExp, accepts?: (tag: string) => boolean): WordPiece[] => {
  const pieces: WordPiece[] = []
  let tag: string | undefined
  let cursor = 0

  for (const match of content.matchAll(pattern)) {
    const nextTag = match[1] ?? ''
    if (accepts && !accepts(nextTag)) {
      continue
    }
    const before = content.slice(cursor, match.index)
    if (before || tag !== undefined) {
      pieces.push({ text: before, tag })
    }
    tag = nextTag
    cursor = match.index + match[0].length
  }

  const tail = content.slice(cursor)
  if (tail || tag !== undefined) {
    pieces.push({ text: tail, tag })
  }
  return pieces
}

/**
 * Untagged leading text is preserved; empty timed pieces retain explicit segment boundaries.
 * Only recognized time tags split content; other angle-bracket text remains literal.
 */
export const splitWordTags = (content: string) => {
  return scanWordTags(content, WORD_TAG_PATTERN, (tag) => !!parseWordTime(tag, 0))
}
