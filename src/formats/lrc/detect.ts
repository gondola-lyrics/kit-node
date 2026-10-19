import { isTime } from '@root/utils'

import { readLrcContent } from './common'
import { TAG_PATTERN } from './utils'

/**
 * A single readable time tag is enough for recognition; metadata alone is not.
 * This is a format probe, not a validity check, so an input of another shape is simply not LRC.
 */
export const detectLrc = (input: unknown) => {
  const content = readLrcContent(input)
  if (!content) {
    return false
  }

  const lines = content.original.replace(/\r\n?/g, '\n').split('\n')
  return lines.some((line) => [...line.matchAll(TAG_PATTERN)].some((match) => isTime(match[1] ?? '')))
}
