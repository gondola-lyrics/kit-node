import type { runtime } from '@gondola-lyrics/model'

import { LineType, Timing, deriveLanguageUsages, getContentText, isWordLevelLine } from '@gondola-lyrics/model/runtime'

import { matchNonLyricCategory, selectNonLyricGroups } from './rules'

export interface RemoveNonLyricLinesOptions {
  /**
   * Removes lines identified under these categories; an empty list removes nothing.
   *
   * @default NON_LYRIC_CATEGORIES
   */
  categories?: readonly string[]
}

/**
 * Removes normal lead lines whose text the shared filter rules identify as a non-lyric notice or label, together with their annotations and background vocals.
 * Matching ignores configured whitespace and ASCII case; whole rules need the entire line while contains rules accept the word anywhere.
 * Refreshes language usages and falls back to line timing when no word-level content remains.
 *
 * @returns The input when unchanged, or a new lyric sharing all unchanged nodes.
 */
export const removeNonLyricLines = (lyric: runtime.Lyric, options: RemoveNonLyricLinesOptions = {}): runtime.Lyric => {
  const groups = selectNonLyricGroups(options.categories)
  if (groups.length === 0) {
    return lyric
  }

  const originalLines = lyric.lines
  let remainingLines: runtime.Line[] | undefined
  for (let index = 0; index < originalLines.length; index += 1) {
    const line = originalLines[index]!
    const category = line.type === LineType.NORMAL ? matchNonLyricCategory(getContentText(line.content), groups) : undefined
    if (category === undefined) {
      remainingLines?.push(line)
      continue
    }
    remainingLines ??= originalLines.slice(0, index)
  }

  if (remainingLines === undefined) {
    return lyric
  }

  let timing = lyric.timing
  if (timing === Timing.WORD) {
    const hasWordLevelContent = remainingLines.some((line) => {
      return isWordLevelLine(line) || line.backgrounds.some(isWordLevelLine)
    })
    if (!hasWordLevelContent) {
      timing = Timing.LINE
    }
  }
  return { ...lyric, lines: remainingLines, timing, languages: deriveLanguageUsages(remainingLines) }
}
