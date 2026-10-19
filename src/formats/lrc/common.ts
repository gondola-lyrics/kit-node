export const FORMAT = 'lrc'

export interface LrcContent {
  original: string
  translations?: string
  romans?: string
}

export const readLrcContent = (input: unknown): LrcContent | null => {
  if (typeof input === 'string') {
    return { original: input }
  }
  if (typeof input !== 'object' || input === null) {
    return null
  }

  const source = input as Partial<LrcContent>
  if (typeof source.original !== 'string') {
    return null
  }

  return {
    original: source.original,
    translations: typeof source.translations === 'string' ? source.translations : undefined,
    romans: typeof source.romans === 'string' ? source.romans : undefined,
  }
}
