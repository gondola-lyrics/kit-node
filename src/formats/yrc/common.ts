export const FORMAT = 'yrc'
export const LINE_PATTERN = /^\[(\d+),(\d+)\]/
export const WORD_PATTERN = /\((\d+,\d+,\d+)\)/g

export interface YrcContent {
  original: string
  translations?: string
  romans?: string
}

/**
 * Accepts plaintext tracks on one timeline without interpreting an API response or an XML container.
 *
 * @returns Original and optional auxiliary text, or null when the original payload is unreadable.
 */
export const readYrcContent = (input: unknown): YrcContent | null => {
  const value = typeof input === 'string' ? { original: input } : input
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const source = value as Partial<YrcContent>
  if (typeof source.original !== 'string' || /^\s*</.test(source.original)) {
    return null
  }
  return {
    original: source.original,
    translations: typeof source.translations === 'string' ? source.translations : undefined,
    romans: typeof source.romans === 'string' ? source.romans : undefined,
  }
}
