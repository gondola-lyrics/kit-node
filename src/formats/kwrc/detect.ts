import { WORD_PATTERN, hasKwrcTranslations, readKwrcContent, readKwrcScales, readKwrcSource } from './common'

/**
 * Recognizes octal parameters with encoded clock rows, or a complete marked bilingual sequence.
 */
export const detectKwrc = (input: unknown): boolean => {
  const source = readKwrcContent(input)
  if (!source) {
    return false
  }

  const track = readKwrcSource(source.original)
  if (readKwrcScales(track.metaTags)) {
    for (const line of track.lines) {
      if (line.clock && Number.isSafeInteger(line.start) && line.text.search(WORD_PATTERN) !== -1) {
        return true
      }
    }
  }

  return hasKwrcTranslations(track)
}
