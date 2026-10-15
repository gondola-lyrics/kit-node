/**
 * An error code reading source text can report, with each format adding its own.
 */
export enum ParseDiagnosticCode {
  FormatUndetected = 'format.undetected',
}

/**
 * A problem found while reading source text.
 * The position is absent when the problem is about the document as a whole.
 */
export interface ParseDiagnostic {
  code: ParseDiagnosticCode

  /**
   * Line in the source text, counted from 1.
   */
  line?: number

  /**
   * Column in that line, counted from 1.
   */
  column?: number
}
