import { LINE_PATTERN, readKrcContent } from './common'

/**
 * Recognizes native KRC from a duration line carrying a complete three-field word tag.
 *
 * @returns Whether the original plaintext contains a strong KRC syntax signal.
 */
export const detectKrc = (input: unknown): boolean => {
  const source = readKrcContent(input)
  if (!source) {
    return false
  }
  return source.original.split(/\r\n?|\n/).some((raw) => {
    const line = raw.trimStart()
    const header = LINE_PATTERN.exec(line)
    return !!header && /<\d+,\d+,\d+>/.test(line.slice(header[0].length))
  })
}
