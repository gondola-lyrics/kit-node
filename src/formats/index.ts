import type { runtime } from '@gondola-lyrics/model'
import type { LyricFormat } from './format'
import type { LrcGenerateOptions, LrcGenerateResult, LrcParseInput, LrcParseOptions } from './lrc'
import type { ParseResult } from './result'
import type { TtmlGenerateOptions, TtmlGenerateResult, TtmlParseOptions } from './ttml'

import { detectLrc, generateLrc, parseLrc } from './lrc'
import { detectTtml, generateTtml, parseTtml } from './ttml'

/**
 * Recognition reads only the original text; the annotation tracks never decide the format.
 *
 * Unrecognized text returns `undefined`.
 */
export const detectFormat = (input: unknown): LyricFormat | undefined => {
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
      return parseTtml(input as string, options)
  }
}

interface GenerateOptions {
  lrc: LrcGenerateOptions
  ttml: TtmlGenerateOptions
}

interface GenerateResults {
  lrc: LrcGenerateResult
  ttml: TtmlGenerateResult
}

const GENERATORS: {
  [Target in LyricFormat]: (lyric: runtime.Lyric, options: GenerateOptions[Target]) => GenerateResults[Target]
} = {
  lrc: generateLrc,
  ttml: generateTtml,
}

/**
 * Generates text in the requested format, which need not match `lyric.format`.
 *
 * The writer map pairs each format's options with its result and requires a writer for every supported format.
 * An unknown target returns `null`.
 */
export const generate = <Target extends LyricFormat>(
  lyric: runtime.Lyric,
  target: Target,
  options: GenerateOptions[Target] = {},
): GenerateResults[Target] | null => {
  if (!Object.hasOwn(GENERATORS, target)) {
    return null
  }

  return GENERATORS[target](lyric, options)
}

export type { ParseResult } from './result'

export type { LyricFormat } from './format'

export * from './lrc'
export * from './ttml'
