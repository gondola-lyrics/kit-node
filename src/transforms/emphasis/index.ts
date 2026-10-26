import type { runtime } from '@gondola-lyrics/model'

import { LineType, WordType, makeWordEmphasis, validateTimeRange } from '@gondola-lyrics/model/runtime'

export interface DeriveWordEmphasisOptions {
  /**
   * Word duration must strictly exceed this threshold, expressed as a non-negative safe integer in milliseconds.
   *
   * @default 3000
   */
  durationThreshold?: number
}

/**
 * Preserves the input array when every element keeps its identity, so unchanged parent nodes can also be reused.
 *
 * The callback must leave inputs untouched and return the original element when unchanged.
 */
const mapShared = <T>(items: T[], transform: (item: T) => T): T[] => {
  let result = items
  for (const [index, item] of items.entries()) {
    const transformed = transform(item)
    if (transformed !== item) {
      if (result === items) {
        result = [...items]
      }
      result[index] = transformed
    }
  }
  return result
}

const deriveContentEmphasis = (content: runtime.LineContent | undefined, durationThreshold: number): runtime.LineContent | undefined => {
  if (content === undefined) {
    return content
  }

  const words = mapShared(content.words, (word) => {
    if (word.type !== WordType.NORMAL || word.emphasis?.derived === false) {
      return word
    }

    const time = word.time
    const emphasized =
      time !== undefined && time.end !== undefined && validateTimeRange(time).length === 0 && time.end - time.start > durationThreshold

    if (emphasized) {
      if (word.emphasis?.value === true) {
        return word
      }
      return { ...word, emphasis: makeWordEmphasis({ value: true, derived: true }) }
    }
    if (word.emphasis === undefined) {
      return word
    }
    return { ...word, emphasis: undefined }
  })

  return words === content.words ? content : { ...content, words }
}

/**
 * Derives emphasis for normal words in lead and background vocals using complete, valid word ranges.
 * The stored word duration must strictly exceed durationThreshold; metadata offset and duration have no effect.
 *
 * Source emphasis, including an explicit false, is preserved; derived emphasis is cleared when a word no longer qualifies.
 *
 * @returns The input when unchanged, or a new lyric sharing all unchanged nodes.
 *
 * @throws {RangeError} If durationThreshold is not a non-negative safe integer in milliseconds.
 */
export const deriveWordEmphasis = (lyric: runtime.Lyric, options: DeriveWordEmphasisOptions = {}): runtime.Lyric => {
  const durationThreshold = options.durationThreshold ?? 3000
  if (!Number.isSafeInteger(durationThreshold) || durationThreshold < 0) {
    throw new RangeError('durationThreshold must be a non-negative safe integer in milliseconds')
  }

  const lines = mapShared(lyric.lines, (line) => {
    if (line.type !== LineType.NORMAL) {
      return line
    }

    const content = deriveContentEmphasis(line.content, durationThreshold)
    const backgrounds = mapShared(line.backgrounds, (background) => {
      const content = deriveContentEmphasis(background.content, durationThreshold)
      return content === background.content ? background : { ...background, content }
    })

    return content === line.content && backgrounds === line.backgrounds ? line : { ...line, content, backgrounds }
  })

  return lines === lyric.lines ? lyric : { ...lyric, lines }
}
