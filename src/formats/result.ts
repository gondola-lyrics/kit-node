import type { runtime } from '@gondola-lyrics/model'
import type { Diagnostic } from '@gondola-lyrics/model/runtime'

import { canonicalizeLyric, validateLyric } from '@gondola-lyrics/model/runtime'

/**
 * A parsed lyric in canonical form, with every rule it breaks.
 */
export interface ParseResult {
  lyric: runtime.Lyric
  diagnostics: Diagnostic[]
}

/**
 * Canonicalizes and validates one parser's output, so every format hands back the same shape.
 *
 * Canonicalization runs first because validation reports paths against the canonical tree.
 */
export const finalizeLyric = (input: runtime.Lyric): ParseResult => {
  const lyric = canonicalizeLyric(input)
  const diagnostics = validateLyric(lyric)

  return { lyric, diagnostics }
}
