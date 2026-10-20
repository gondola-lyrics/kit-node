import type { runtime } from '@gondola-lyrics/model'
import type { LyricFormat } from './format'
import type { LrcGenerateOptions, LrcGenerateResult, LrcParseInput, LrcParseOptions } from './lrc'
import type { ParseResult } from './result'

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
 * Unrecognized text returns `null`; a recognized format returns its canonical lyric and diagnostics.
 * Annotation tracks travel with the source and are attached by the format's parser.
 */
export const parse = (input: unknown, options: LrcParseOptions = {}): ParseResult | null => {
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
 * Generates text in the requested format, which need not match `lyric.format`.
 */
export const generate = (lyric: runtime.Lyric, target: LyricFormat, options: LrcGenerateOptions = {}): LrcGenerateResult => {
  switch (target) {
    case 'lrc':
      return generateLrc(lyric, options)
  }
}

export type { ParseResult } from './result'

export type { LyricFormat } from './format'

export * from './lrc'
