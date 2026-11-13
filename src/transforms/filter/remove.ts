import type { EnrichedLyric } from '@gondola-lyrics/model'

import { EnrichedLineType, TimingLevel, deriveEnrichedLanguageUsages, getEnrichedLineContentText, hasEnrichedLineWords } from '@gondola-lyrics/model'

import { matchNonLyricCategory, selectNonLyricGroups } from './rules'

export interface RemoveNonLyricLinesOptions {
  /**
   * Removes lines identified under these categories; an empty list skips the shared rules.
   * First-line music information is selected independently.
   *
   * @default NON_LYRIC_CATEGORIES
   */
  categories?: readonly string[]
  /**
   * Enables first-line music-information matching using these known titles and artists.
   * Omitting this option, or leaving either list empty, skips the check; lyric metadata is not inferred.
   */
  musicInfo?: {
    titles?: readonly string[]
    artists?: readonly string[]
  }
}

const toMusicInfoMatchText = (text: string): string => {
  return text
    .normalize('NFC')
    .trim()
    .replace(/\s+/gu, ' ')
    .replace(/[A-Z]+/g, (run) => run.toLowerCase())
}

const findFirstMusicInfoLine = (lyric: EnrichedLyric, musicInfo: NonNullable<RemoveNonLyricLinesOptions['musicInfo']>) => {
  const titles = (musicInfo.titles ?? []).map(toMusicInfoMatchText).filter(Boolean)
  const artists = (musicInfo.artists ?? []).map(toMusicInfoMatchText).filter(Boolean)
  if (!titles.length || !artists.length) {
    return -1
  }

  const index = lyric.lines.findIndex((line) => {
    return line.type === EnrichedLineType.NORMAL && !!getEnrichedLineContentText(line.content).trim()
  })
  if (index === -1) {
    return -1
  }

  const parts = getEnrichedLineContentText(lyric.lines[index]!.content).trim().split(' - ')
  if (parts.length !== 2) {
    return -1
  }
  const left = toMusicInfoMatchText(parts[0]!)
  const right = toMusicInfoMatchText(parts[1]!)
  if (!left || !right) {
    return -1
  }

  const titleOnLeft = titles.some((title) => left.includes(title))
  const titleOnRight = titles.some((title) => right.includes(title))
  const artistOnLeft = artists.some((artist) => left.includes(artist))
  const artistOnRight = artists.some((artist) => right.includes(artist))
  return (titleOnLeft && artistOnRight) || (artistOnLeft && titleOnRight) ? index : -1
}

/**
 * Removes normal lead lines matched by the shared notice rules and, when musicInfo is provided, first-line song information.
 * The first non-empty normal line must have one literal " - " separator and a known title and artist on opposite sides; either order and extra text such as bracketed aliases are accepted.
 * Drops attached annotations and backgrounds, refreshes language usages, and falls back to line timing when no word-level content remains.
 *
 * @returns The input when unchanged, or a new lyric sharing all unchanged nodes.
 */
export const removeNonLyricLines = (lyric: EnrichedLyric, options: RemoveNonLyricLinesOptions = {}): EnrichedLyric => {
  const groups = selectNonLyricGroups(options.categories)
  const musicInfoIndex = options.musicInfo ? findFirstMusicInfoLine(lyric, options.musicInfo) : -1
  if (!groups.length && musicInfoIndex === -1) {
    return lyric
  }

  const lines = lyric.lines.filter((line, index) => {
    if (index === musicInfoIndex) {
      return false
    }
    return line.type !== EnrichedLineType.NORMAL || matchNonLyricCategory(getEnrichedLineContentText(line.content), groups) === undefined
  })

  if (lines.length === lyric.lines.length) {
    return lyric
  }

  let timing = lyric.timing
  if (timing === TimingLevel.WORD) {
    const hasWordLevelContent = lines.some((line) => {
      return hasEnrichedLineWords(line) || line.backgrounds.some(hasEnrichedLineWords)
    })
    if (!hasWordLevelContent) {
      timing = TimingLevel.LINE
    }
  }
  return { ...lyric, lines, timing, languageUsages: deriveEnrichedLanguageUsages(lines) }
}
