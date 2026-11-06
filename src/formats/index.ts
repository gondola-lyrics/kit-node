import type { runtime } from '@gondola-lyrics/model'
import type { LyricFormat } from './format'
import type { KrcParseInput } from './krc'
import type { LrcGenerateOptions, LrcGenerateResult, LrcParseInput, LrcParseOptions } from './lrc'
import type { QrcParseInput, QrcParseOptions } from './qrc'
import type { ParseResult } from './result'
import type { TtmlGenerateOptions, TtmlGenerateResult, TtmlParseOptions } from './ttml'
import type { YrcParseInput, YrcParseOptions } from './yrc'

import { detectKrc, parseKrc } from './krc'
import { detectLrc, generateLrc, parseLrc } from './lrc'
import { detectQrc, parseQrc } from './qrc'
import { detectTtml, generateTtml, parseTtml } from './ttml'
import { detectYrc, parseYrc } from './yrc'

/**
 * Recognition reads only the original text; the annotation tracks never decide the format.
 *
 * Unrecognized text returns `undefined`.
 */
export const detectFormat = (input: unknown): LyricFormat | undefined => {
  if (detectKrc(input)) {
    return 'krc'
  }
  if (detectYrc(input)) {
    return 'yrc'
  }
  if (detectQrc(input)) {
    return 'qrc'
  }
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
export const parse = (input: unknown, options: LrcParseOptions & QrcParseOptions & TtmlParseOptions & YrcParseOptions = {}): ParseResult | null => {
  const format = detectFormat(input)
  if (!format) {
    return null
  }

  switch (format) {
    case 'krc':
      return parseKrc(input as string | KrcParseInput)
    case 'lrc':
      return parseLrc(input as string | LrcParseInput, options)
    case 'qrc':
      return parseQrc(input as string | QrcParseInput, options)
    case 'ttml':
      return parseTtml(input as string, options)
    case 'yrc':
      return parseYrc(input as string | YrcParseInput, options)
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

export type GenerateFormat = keyof GenerateOptions

const GENERATORS: {
  [Target in GenerateFormat]: (lyric: runtime.Lyric, options: GenerateOptions[Target]) => GenerateResults[Target]
} = {
  lrc: generateLrc,
  ttml: generateTtml,
}

/**
 * Generates text in the requested format, which need not match `lyric.format`.
 *
 * The writer map pairs options with results only for formats that have an implemented writer.
 * An unknown target returns `null`.
 */
export const generate = <Target extends GenerateFormat>(
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

export * from './krc'
export * from './lrc'
export * from './qrc'
export * from './ttml'
export * from './yrc'
