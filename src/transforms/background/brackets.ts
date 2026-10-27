import type { runtime } from '@gondola-lyrics/model'

import { WordType, makeLineContentText, makeLineContentWords } from '@gondola-lyrics/model/runtime'

import { mapShared } from '@root/utils'

import { isCloseBracket, isNormalWord, isOpenBracket } from './utils'

/**
 * Removes one leading bracket from the first sung word and one trailing bracket from the last, so an inner pair stays as written.
 *
 * Space words at the same edge go with the bracket, and a word left with no text goes too, since a sung word must carry something.
 */
const stripWordEdges = (words: runtime.Word[]): runtime.Word[] => {
  const firstIndex = words.findIndex(isNormalWord)
  const first = words[firstIndex]
  const last = words[words.findLastIndex(isNormalWord)]
  const stripStart = first ? isOpenBracket(first.text.charAt(0)) : false
  const stripEnd = last ? isCloseBracket(last.text.charAt(last.text.length - 1)) : false
  if (!stripStart && !stripEnd) {
    return words
  }

  const result = [...words]
  if (stripStart && first) {
    const text = first.text.slice(1)
    if (text) {
      result[firstIndex] = { ...first, text }
    } else {
      result.splice(firstIndex, 1)
    }
    while (result[0]?.type === WordType.SPACE) {
      result.shift()
    }
  }

  // The end is resolved again, since stripping the start may have removed the word it referred to.
  const endIndex = result.findLastIndex(isNormalWord)
  const end = result[endIndex]
  if (stripEnd && end) {
    const text = end.text.slice(0, -1)
    if (text) {
      result[endIndex] = { ...end, text }
    } else {
      result.splice(endIndex, 1)
    }
    while (result.at(-1)?.type === WordType.SPACE) {
      result.pop()
    }
  }

  return result
}

/**
 * Plain text is read literally, so a source that padded it with spaces keeps them; only word content
 * treats space words as the structural separators they are.
 */
const stripContentBrackets = (content: runtime.LineContent | undefined): runtime.LineContent | undefined => {
  if (!content) {
    return content
  }

  if (!content.words.length) {
    const text = content.text
    if (!text) {
      return content
    }
    const start = isOpenBracket(text.charAt(0)) ? 1 : 0
    const end = isCloseBracket(text.charAt(text.length - 1)) ? -1 : 0
    if (!start && !end) {
      return content
    }
    const stripped = text.slice(start, end === 0 ? undefined : end)
    return stripped ? makeLineContentText(stripped) : undefined
  }

  const words = stripWordEdges(content.words)
  if (words === content.words) {
    return content
  }
  return words.length ? makeLineContentWords(words) : undefined
}

const stripLineBackgrounds = (line: runtime.Line): runtime.Line => {
  if (!line.backgrounds.length) {
    return line
  }

  let changed = false
  const kept: runtime.LineBackground[] = []
  for (const background of line.backgrounds) {
    const content = stripContentBrackets(background.content)
    if (content === background.content) {
      kept.push(background)
      continue
    }
    changed = true
    if (content) {
      kept.push({ ...background, content })
    }
  }
  return changed ? { ...line, backgrounds: kept } : line
}

/**
 * Removes the brackets some sources wrap around background vocals.
 *
 * One layer is removed from each edge of every background line, leaving a nested pair as `(x)`.
 * A line left with no content is dropped, since a background line must carry something.
 *
 * @returns The input when unchanged, or a new lyric sharing all unchanged nodes.
 */
export const stripBackgroundBrackets = (lyric: runtime.Lyric): runtime.Lyric => {
  const lines = mapShared(lyric.lines, stripLineBackgrounds)
  return lines === lyric.lines ? lyric : { ...lyric, lines }
}
