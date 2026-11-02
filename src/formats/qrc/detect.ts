import { hasTimedLines, readContent } from './common'

/**
 * Detects QRC from the original track so annotations cannot change format selection.
 *
 * @returns Whether plaintext or a supported XML payload contains a timed QRC row.
 */
export const detectQrc = (input: unknown): boolean => {
  const content = readContent(input)
  return content !== null && hasTimedLines(content.original)
}
