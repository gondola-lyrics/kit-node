import type { runtime } from '@gondola-lyrics/model'
import type { LrcGenerateOptions, LrcGenerateResult } from './lrc'

import { detectLrc, generateLrc, parseLrc } from './lrc'

export * from './lrc'

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

/**
 * Generates text in the lyric's own format.
 *
 * A format without a generator returns `null` rather than guessing another one.
 */
export const generate = (lyric: runtime.Lyric, options: LrcGenerateOptions = {}): LrcGenerateResult | null => {
  switch (lyric.format) {
    case 'lrc':
      return generateLrc(lyric, options)
    default:
      return null
  }
}
