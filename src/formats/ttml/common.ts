export interface TtmlContent {
  original: string
}

export type TtmlProfile = 'amll' | 'itunes'

export const FORMAT = 'ttml'

export const AMLL_HINT_PATTERN = /xmlns:amll|amll:meta/iu

export const ITUNES_HINT_PATTERN = /xmlns:itunes|iTunesMetadata|itunes:timing=/iu

export const readTtmlContent = (input: unknown): TtmlContent | null => {
  if (typeof input === 'string') {
    return { original: input }
  }
  if (!input || typeof input !== 'object') {
    return null
  }

  const source = input as Partial<TtmlContent>
  if (typeof source.original !== 'string') {
    return null
  }

  return { original: source.original }
}

export const readTtmlProfile = (source: string): TtmlProfile => {
  return AMLL_HINT_PATTERN.test(source) ? 'amll' : 'itunes'
}
