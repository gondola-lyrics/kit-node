export const FORMAT = 'krc'
export const LINE_PATTERN = /^\[(\d+),(\d+)\]/
export const WORD_PATTERN = /<(\d+,\d+,\d+)>/g

export interface KrcContent {
  original: string
}

/**
 * Reads decrypted plaintext without unwrapping XML or accepting auxiliary tracks.
 *
 * @returns Original content, or null when the input cannot be read as plaintext KRC.
 */
export const readKrcContent = (input: unknown): KrcContent | null => {
  const source = typeof input === 'string' ? { original: input } : input
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return null
  }
  const original = (source as Partial<KrcContent>).original
  if (typeof original !== 'string' || /^\s*</.test(original)) {
    return null
  }
  return { original }
}
