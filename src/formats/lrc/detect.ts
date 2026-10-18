import { isTime } from '@root/utils'

import { TAG_PATTERN } from './utils'

/**
 * A single readable time tag is enough for recognition; metadata alone is not.
 * This is a format probe, not a validity check.
 */
export const detectLrc = (text: string) => {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  return lines.some((line) => [...line.matchAll(TAG_PATTERN)].some((match) => isTime(match[1] ?? '')))
}
