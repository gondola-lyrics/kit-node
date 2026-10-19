import type { runtime } from '@gondola-lyrics/model'
import type { LrcGenerateOptions, LrcGenerateResult, LrcParseInput, LrcParseOptions } from './lrc'

import { detectLrc, generateLrc, parseLrc } from './lrc'

/**
 * Recognition reads only the original text; the annotation tracks never decide the format.
 *
 * Unrecognized text returns `undefined`.
 */
export const detectFormat = (input: unknown) => {
  if (detectLrc(input)) {
    return 'lrc'
  }

  return undefined
}

/**
 * Unrecognized text returns `null`; a recognized format returns a lyric with its parser-assigned status.
 * Annotation tracks travel with the source and are attached by the format's parser.
 */
export const parse = (input: unknown, options: LrcParseOptions = {}): runtime.Lyric | null => {
  const format = detectFormat(input)
  if (!format) {
    return null
  }

  switch (format) {
    case 'lrc':
      return parseLrc(input as string | LrcParseInput, options)
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

export type { LyricFormat } from './format'

export * from './lrc'
