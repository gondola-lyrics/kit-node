import type { runtime } from '@gondola-lyrics/model'

import { LineType, Timing, deriveLanguageUsages, getContentText, isWordLevelLine } from '@gondola-lyrics/model/runtime'

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

const findFirstMusicInfoLine = (lyric: runtime.Lyric, musicInfo: NonNullable<RemoveNonLyricLinesOptions['musicInfo']>) => {
  const titles = (musicInfo.titles ?? []).map(toMusicInfoMatchText).filter((title) => title !== '')
  const artists = (musicInfo.artists ?? []).map(toMusicInfoMatchText).filter((artist) => artist !== '')
  if (titles.length === 0 || artists.length === 0) {
    return -1
  }

  const index = lyric.lines.findIndex((line) => {
    return line.type === LineType.NORMAL && getContentText(line.content).trim() !== ''
  })
  if (index === -1) {
    return -1
  }

  const parts = getContentText(lyric.lines[index]!.content).trim().split(' - ')
  if (parts.length !== 2) {
    return -1
  }
  const left = toMusicInfoMatchText(parts[0]!)
  const right = toMusicInfoMatchText(parts[1]!)
  if (left === '' || right === '') {
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
export const removeNonLyricLines = (lyric: runtime.Lyric, options: RemoveNonLyricLinesOptions = {}): runtime.Lyric => {
  const groups = selectNonLyricGroups(options.categories)
  const musicInfoIndex = options.musicInfo === undefined ? -1 : findFirstMusicInfoLine(lyric, options.musicInfo)
  if (groups.length === 0 && musicInfoIndex === -1) {
    return lyric
  }

  const lines = lyric.lines.filter((line, index) => {
    if (index === musicInfoIndex) {
      return false
    }
    return line.type !== LineType.NORMAL || matchNonLyricCategory(getContentText(line.content), groups) === undefined
  })

  if (lines.length === lyric.lines.length) {
    return lyric
  }

  let timing = lyric.timing
  if (timing === Timing.WORD) {
    const hasWordLevelContent = lines.some((line) => {
      return isWordLevelLine(line) || line.backgrounds.some(isWordLevelLine)
    })
    if (!hasWordLevelContent) {
      timing = Timing.LINE
    }
  }
  return { ...lyric, lines, timing, languages: deriveLanguageUsages(lines) }
}
