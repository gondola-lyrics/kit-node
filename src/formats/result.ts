import type { Diagnostic, EnrichedLyric } from '@gondola-lyrics/model'

import { canonicalizeEnrichedLyric, validateEnrichedLyric } from '@gondola-lyrics/model'

/**
 * A parsed lyric in canonical form, with every rule it breaks.
 */
export interface ParseResult {
  lyric: EnrichedLyric
  diagnostics: Diagnostic[]
}

/**
 * Canonicalizes and validates one parser's output, so every format hands back the same shape.
 *
 * Canonicalization runs first because validation reports paths against the canonical tree.
 */
export const finalizeLyric = (input: EnrichedLyric): ParseResult => {
  const lyric = canonicalizeEnrichedLyric(input)
  const diagnostics = validateEnrichedLyric(lyric)

  return { lyric, diagnostics }
}
