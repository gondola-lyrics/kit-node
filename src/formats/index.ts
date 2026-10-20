import type { runtime } from '@gondola-lyrics/model'
import type { LyricFormat } from './format'
import type { LrcGenerateOptions, LrcGenerateResult, LrcParseInput, LrcParseOptions } from './lrc'
import type { ParseResult } from './result'
import type { TtmlContent, TtmlParseOptions } from './ttml'

import { detectLrc, generateLrc, parseLrc } from './lrc'
import { detectTtml, parseTtml } from './ttml'

/**
 * Recognition reads only the original text; the annotation tracks never decide the format.
 *
 * Unrecognized text returns `undefined`.
 */
export const detectFormat = (input: unknown) => {
  if (detectLrc(input)) {
    return 'lrc'
  }
  if (detectTtml(input)) {
    return 'ttml'
  }

  return undefined
}

/**
 * Unrecognized text returns `null`; a recognized format returns its canonical lyric and diagnostics.
 * Annotation tracks travel with the source and are attached by the format's parser.
 */
export const parse = (input: unknown, options: LrcParseOptions & TtmlParseOptions = {}): ParseResult | null => {
  const format = detectFormat(input)
  if (!format) {
    return null
  }

  switch (format) {
    case 'lrc':
      return parseLrc(input as string | LrcParseInput, options)
    case 'ttml':
      return parseTtml(input as string | TtmlContent, options)
  }
}

/**
 * Generates text in the requested format, which need not match `lyric.format`.
 *
 * A format without a writer has no branch here, so adding one to `LyricFormat` makes this fail to compile.
 */
export const generate = (lyric: runtime.Lyric, target: LyricFormat, options: LrcGenerateOptions = {}): LrcGenerateResult => {
  switch (target) {
    case 'lrc':
      return generateLrc(lyric, options)
    case 'ttml':
      throw new Error('ttml generation is not implemented yet')
  }
}

export type { ParseResult } from './result'

export type { LyricFormat } from './format'

export * from './lrc'
export * from './ttml'
