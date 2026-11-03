import { LINE_PATTERN, readKrcContent } from './common'

// Kugou wraps its language matrix in a base64 object, so `ey` is the readable head of `{"`.
const LANGUAGE_PATTERN = /\[language:\s*ey[A-Za-z0-9+/=]*\]/

/**
 * Recognizes native KRC from a duration line carrying a complete three-field word tag, or from the Kugou language container.
 *
 * Both signals live in the original plaintext, so an auxiliary track still cannot decide the format.
 *
 * @returns Whether the original plaintext contains a strong KRC syntax signal.
 */
export const detectKrc = (input: unknown): boolean => {
  const source = readKrcContent(input)
  if (!source) {
    return false
  }

  // Row syntax stays the stronger signal; the container tag also covers Kugou's LRC fallback.
  if (LANGUAGE_PATTERN.test(source.original)) {
    return true
  }

  return source.original.split(/\r\n?|\n/).some((raw) => {
    const line = raw.trimStart()
    const header = LINE_PATTERN.exec(line)
    return !!header && /<\d+,\d+,\d+>/.test(line.slice(header[0].length))
  })
}
