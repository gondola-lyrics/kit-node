export const FORMAT = 'ttml'

export type TtmlProfile = 'amll' | 'itunes'

export const NAMESPACE_AMLL = 'http://www.example.com/ns/amll'
export const NAMESPACE_ITUNES = 'http://itunes.apple.com/lyric-ttml-extensions'
export const NAMESPACE_ITUNES_METADATA = 'http://music.apple.com/lyric-ttml-internal'

/**
 * Accepts the text input shared by TTML detection and parsing.
 */
export const readTtmlContent = (input: unknown): string | null => {
  if (typeof input !== 'string') {
    return null
  }
  return input
}
