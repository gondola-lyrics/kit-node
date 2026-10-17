import type { runtime } from '@gondola-lyrics/model'

import { detectLrc, parseLrc } from './lrc'

/**
 * Recognition does not imply valid source syntax.
 *
 * Unrecognized text returns `undefined`.
 */
export const detectFormat = (text: string) => {
  if (detectLrc(text)) {
    return 'lrc'
  }

  return undefined
}

/**
 * Unrecognized text returns `null`; a recognized format returns a lyric with its parser-assigned status.
 */
export const parse = (text: string): runtime.Lyric | null => {
  const format = detectFormat(text)
  if (!format) {
    return null
  }

  switch (format) {
    case 'lrc':
      return parseLrc(text)
  }
}
