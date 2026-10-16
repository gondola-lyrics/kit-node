import { isTime } from '@root/utils'

import { TAG_PATTERN } from './utils'

/**
 * Whether the text looks like LRC, which it does as soon as one line carries a time tag.
 * Detection reads no further than that: whether the rest of the file reads well is for the reader to say.
 */
export const detectLrc = (text: string) => {
  const lines = text.replaceAll('\r\n', '\n').split('\n')
  return lines.some((line) => [...line.matchAll(TAG_PATTERN)].some((match) => isTime(match[1] ?? '')))
}
