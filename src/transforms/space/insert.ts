import type { runtime } from '@gondola-lyrics/model'
import type { InsertSpacesRule } from './constants'

import {
  LineType,
  makeLineAnnotationRoman,
  makeLineAnnotationTranslation,
  makeLineContentText,
  makeLineContentWords,
  makeWordSpace,
} from '@gondola-lyrics/model/runtime'

import { mapShared } from '@root/utils'

import { isNormalWord } from '../background/utils'
import { insertSpaces, resolveRules } from './rules'

export interface InsertSpacesOptions {
  /**
   * Rules to apply; omitting the list applies all of them.
   */
  rules?: InsertSpacesRule[]
  /**
   * Rewrite the translation and romanization tracks too.
   *
   * @default true
   */
  annotations?: boolean
}

/**
 * Maps the rewritten text back onto the original words.
 *
 * Every non-space character of the original survives in order, so walking both strings keeps each word's time,
 * language and annotation while the inserted spaces become their own words.
 * A word whose characters stay adjacent in the rewrite is kept whole, so only a word the space actually cuts is split.
 */
const alignWords = (words: runtime.Word[], text: string) => {
  const source = words.filter(isNormalWord)
  const result: runtime.Word[] = []
  let cursor = 0

  const takeSpaces = () => {
    let spaces = ''
    while (text[cursor] === ' ') {
      spaces += ' '
      cursor += 1
    }
    return spaces
  }

  for (const word of source) {
    const spaces = takeSpaces()
    if (spaces) {
      result.push(makeWordSpace({ text: spaces }))
    }

    // A word the rewrite left intact keeps its identity, including any annotation and emphasis.
    if (text.startsWith(word.text, cursor)) {
      result.push(word)
      cursor += word.text.length
      continue
    }

    // The rewrite split this word, so each piece carries the slice it stands for.
    let remaining = word.text
    while (remaining) {
      let taken = 0
      while (taken < remaining.length && text[cursor + taken] === remaining[taken]) {
        taken += 1
      }
      if (taken === 0) {
        return undefined
      }
      result.push({ ...word, text: remaining.slice(0, taken) })
      cursor += taken
      remaining = remaining.slice(taken)
      if (!remaining) {
        break
      }
      const split = takeSpaces()
      if (!split) {
        // Nothing separates the pieces, so the rewrite changed more than spacing.
        return undefined
      }
      result.push(makeWordSpace({ text: split }))
    }
  }

  const tail = takeSpaces()
  if (tail) {
    result.push(makeWordSpace({ text: tail }))
  }

  // A leftover character means the rewrite changed something other than spacing, so the caller keeps the original words.
  if (cursor !== text.length) {
    return undefined
  }
  return result
}

/**
 * Applies the rules to a word-level content, keeping it unchanged when the alignment fails.
 */
const applyToWords = (content: runtime.LineContent, rules: Set<InsertSpacesRule>) => {
  const text = content.words.map((word) => word.text).join('')
  const rewritten = insertSpaces(text, rules)
  if (rewritten === text) {
    return content
  }

  const words = alignWords(content.words, rewritten)
  if (!words) {
    return content
  }
  return words.length ? makeLineContentWords(words) : undefined
}

/**
 * Applies the rules to a plain-text content, dropping a line the rules would leave empty.
 */
const applyToText = (content: runtime.LineContent, rules: Set<InsertSpacesRule>) => {
  const text = content.text ?? ''
  const rewritten = insertSpaces(text, rules)
  if (rewritten === text) {
    return content
  }
  return rewritten ? makeLineContentText(rewritten) : undefined
}

/**
 * Applies the rules to one content by the shape it carries.
 */
const applyToContent = (content: runtime.LineContent | undefined, rules: Set<InsertSpacesRule>) => {
  if (!content) {
    return content
  }
  return content.words.length ? applyToWords(content, rules) : applyToText(content, rules)
}

/**
 * Applies the rules to the line annotation, keeping the entries they leave untouched.
 */
const applyToAnnotation = (annotation: runtime.LineAnnotation | undefined, rules: Set<InsertSpacesRule>) => {
  if (!annotation) {
    return annotation
  }

  let changed = false
  const romans = annotation.romans.map((item) => {
    const text = insertSpaces(item.text, rules)
    if (text === item.text) {
      return item
    }
    changed = true
    return makeLineAnnotationRoman({ ...item, text })
  })
  const translations = annotation.translations.map((item) => {
    const text = insertSpaces(item.text, rules)
    if (text === item.text) {
      return item
    }
    changed = true
    return makeLineAnnotationTranslation({ ...item, text })
  })
  return changed ? { ...annotation, romans, translations } : annotation
}

/**
 * Inserts the spaces a source left out, so CJK text set against Latin letters, digits or punctuation reads evenly.
 *
 * A word-level line keeps every word's time and annotation: an inserted space becomes its own space word,
 * and a word the rules split yields one word per character, all sharing the original range.
 * A plain-text line and the annotation tracks are rewritten as whole strings.
 *
 * @returns The input when unchanged, or a new lyric sharing all unchanged nodes.
 */
export const insertSpacesInLines = (lyric: runtime.Lyric, options: InsertSpacesOptions = {}): runtime.Lyric => {
  const rules = resolveRules(options.rules)
  const annotations = options.annotations ?? true

  const applyToBackground = (background: runtime.LineBackground): runtime.LineBackground => {
    const content = applyToContent(background.content, rules)
    const annotation = annotations ? applyToAnnotation(background.annotation, rules) : background.annotation
    if (content === background.content && annotation === background.annotation) {
      return background
    }
    return { ...background, content, annotation }
  }

  const lines = mapShared(lyric.lines, (line) => {
    if (line.type !== LineType.NORMAL) {
      return line
    }

    const content = applyToContent(line.content, rules)
    const annotation = annotations ? applyToAnnotation(line.annotation, rules) : line.annotation
    const backgrounds = mapShared(line.backgrounds, applyToBackground)
    if (content === line.content && annotation === line.annotation && backgrounds === line.backgrounds) {
      return line
    }
    return { ...line, content, annotation, backgrounds }
  })

  return lines === lyric.lines ? lyric : { ...lyric, lines }
}

export type { InsertSpacesRule } from './constants'

export { InsertSpacesRules } from './constants'
