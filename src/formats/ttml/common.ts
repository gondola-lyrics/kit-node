export const FORMAT = 'ttml'

export type TtmlProfile = 'amll' | 'itunes'

export const AMLL_HINT_PATTERN = /xmlns:amll|amll:meta/iu

export const ITUNES_HINT_PATTERN = /xmlns:itunes|iTunesMetadata|itunes:timing=/iu

/**
 * Accepts the text input shared by TTML detection and parsing.
 */
export const readTtmlContent = (input: unknown): string | null => {
  if (typeof input !== 'string') {
    return null
  }
  return input
}
