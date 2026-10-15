import type { storage } from '@gondola-lyrics/model'
import type { LyricFormat } from './format'
import type { ParseDiagnostic } from './diagnostic'

/**
 * What reading source text produced.
 * Reading never throws: unreadable input yields an empty lyric and at least one diagnostic.
 */
export interface ParseResult {
  /**
   * The format detection settled on, or undefined when it recognised nothing.
   */
  format: LyricFormat | undefined

  lyric: storage.Lyric

  diagnostics: ParseDiagnostic[]
}
