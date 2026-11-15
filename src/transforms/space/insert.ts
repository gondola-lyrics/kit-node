import type {
  EnrichedLineAnnotation,
  EnrichedLineBackground,
  EnrichedLineContent,
  EnrichedLyric,
  EnrichedWord,
  TextToken,
} from '@gondola-lyrics/model'
import type { InsertSpacesRule } from './constants'

import {
  EnrichedLineType,
  EnrichedWordType,
  getEnrichedLineAnnotationRomanText,
  makeEnrichedLineAnnotationRoman,
  makeEnrichedLineAnnotationRomanContentText,
  makeEnrichedLineAnnotationRomanContentTokens,
  makeEnrichedLineAnnotationTranslation,
  makeEnrichedLineContentText,
  makeEnrichedLineContentWords,
  makeEnrichedWordSpace,
  makeTextToken,
} from '@gondola-lyrics/model'

import { mapShared } from '@root/utils'

import { insertSpaces, resolveRules } from './rules'

export interface InsertSpacesOptions {
  /**
   * Rules to apply; omitting the list applies all of them, while an empty list leaves the lyric unchanged.
   */
  rules?: InsertSpacesRule[]
  /**
   * Rewrite the translation and romanization tracks too.
   *
   * @default true
   */
  annotations?: boolean
}

interface AlignedText {
  text: string
  source: number | null
  space: boolean
}

const WHITESPACE = /[\p{White_Space}\uFEFF]/u
const TRAILING_PUNCTUATION = /^[\p{Pe}\p{Pf}\p{Po}]+$/u

/**
 * Retains source ownership while changing whitespace; a null source belongs to a newly inserted separator.
 */
const alignTexts = (texts: string[], text: string): AlignedText[] | null => {
  const original = texts.join('')
  const parts: AlignedText[] = []
  let from = 0
  let to = 0
  let source = 0
  let boundary = texts[0]?.length ?? 0

  const readSource = (offset: number): number | null => {
    while (source < texts.length && offset >= boundary) {
      source += 1
      boundary += texts[source]?.length ?? 0
    }
    return source < texts.length ? source : null
  }

  const append = (char: string, owner: number | null, space: boolean) => {
    const previous = parts.at(-1)
    if (previous && previous.source === owner && previous.space === space) {
      previous.text += char
    } else {
      parts.push({ text: char, source: owner, space })
    }
  }

  while (from < original.length || to < text.length) {
    let whitespace = from
    while (from < original.length && WHITESPACE.test(original[from]!)) {
      from += 1
    }
    while (to < text.length && WHITESPACE.test(text[to]!)) {
      while (whitespace < from && original[whitespace] !== text[to]) {
        whitespace += 1
      }
      const owner = whitespace < from ? readSource(whitespace++) : null
      append(text[to]!, owner, true)
      to += 1
    }
    if (from === original.length && to === text.length) {
      break
    }
    if (from >= original.length || to >= text.length || original[from] !== text[to]) {
      return null
    }
    const owner = readSource(from)
    if (owner === null) {
      return null
    }
    append(text[to]!, owner, false)
    from += 1
    to += 1
  }

  const trailing = new Set<number>()
  let beforeInsertedSpace = false
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index]!
    if (part.space) {
      beforeInsertedSpace = part.source === null
    } else if (beforeInsertedSpace && TRAILING_PUNCTUATION.test(part.text)) {
      trailing.add(index)
    } else {
      beforeInsertedSpace = false
    }
  }

  const result: AlignedText[] = []
  for (const [index, part] of parts.entries()) {
    const previous = result.at(-1)
    const adjacent = index > 0 && !parts[index - 1]!.space
    if (adjacent && previous && !previous.space && trailing.has(index)) {
      previous.text += part.text
    } else if (previous && part.source !== null && previous.source === part.source) {
      previous.text += part.text
      previous.space = previous.space && part.space
    } else {
      result.push(part)
    }
  }
  return result
}

const alignWords = (words: EnrichedWord[], text: string): EnrichedWord[] | null => {
  const parts = alignTexts(
    words.map((word) => word.text),
    text,
  )
  if (!parts) {
    return null
  }

  const retained = new Set(parts.map((part) => part.source))
  const losesData = words.some((word, index) => {
    return !retained.has(index) && !!(word.time || word.language || word.annotation || word.emphasis)
  })
  if (losesData) {
    return null
  }

  return parts.map((part) => {
    const word = part.source === null ? null : words[part.source]!
    if (!word) {
      return makeEnrichedWordSpace({ text: part.text })
    }
    if (word.type === EnrichedWordType.SPACE) {
      return part.text === word.text ? word : makeEnrichedWordSpace({ text: part.text })
    }
    return part.text === word.text ? word : { ...word, text: part.text }
  })
}

const alignRomanTokens = (tokens: TextToken[], text: string): TextToken[] | null => {
  const parts = alignTexts(
    tokens.map((token) => token.text),
    text,
  )
  if (!parts) {
    return null
  }

  const retained = new Set(parts.map((part) => part.source))
  const losesData = tokens.some((token, index) => {
    return !retained.has(index) && (token.time !== undefined || Object.keys(token.extra).length > 0)
  })
  if (losesData) {
    return null
  }

  const result: TextToken[] = []
  for (const part of parts) {
    if (part.source === null) {
      const previous = result.at(-1)
      const last = previous ? ([...previous.text.slice(-2)].at(-1) ?? '') : ''
      if (part.space && previous && TRAILING_PUNCTUATION.test(last)) {
        result[result.length - 1] = { ...previous, text: previous.text + part.text }
      } else {
        result.push(makeTextToken({ text: part.text }))
      }
      continue
    }
    const token = tokens[part.source]!
    result.push(part.text === token.text ? token : { ...token, text: part.text })
  }

  return result.some((token) => token.time !== undefined) ? result : null
}

/**
 * Applies the rules to a word-level content, keeping it unchanged when the alignment fails.
 */
const applyToWords = (content: EnrichedLineContent, rules: Set<InsertSpacesRule>) => {
  const text = content.words.map((word) => word.text).join('')
  const rewritten = insertSpaces(text, rules)
  if (rewritten === text) {
    return content
  }

  const words = alignWords(content.words, rewritten)
  if (!words) {
    return content
  }

  return words.length ? makeEnrichedLineContentWords(words) : null
}

/**
 * Applies the rules to a plain-text content, dropping a line the rules would leave empty.
 */
const applyToText = (content: EnrichedLineContent, rules: Set<InsertSpacesRule>) => {
  const text = content.text ?? ''
  const rewritten = insertSpaces(text, rules)
  if (rewritten === text) {
    return content
  }

  return rewritten ? makeEnrichedLineContentText(rewritten) : null
}

/**
 * Applies the rules to one content by the shape it carries.
 */
const applyToContent = (content: EnrichedLineContent | undefined, rules: Set<InsertSpacesRule>) => {
  if (!content) {
    return null
  }
  return content.words.length ? applyToWords(content, rules) : applyToText(content, rules)
}

/**
 * Applies the rules to the line annotation, keeping the entries they leave untouched.
 */
const applyToAnnotation = (annotation: EnrichedLineAnnotation | undefined, rules: Set<InsertSpacesRule>) => {
  if (!annotation) {
    return null
  }

  const romans = mapShared(annotation.romans, (item) => {
    const original = getEnrichedLineAnnotationRomanText(item)
    const text = insertSpaces(original, rules)
    if (text === original) {
      return item
    }
    if (item.content?.tokens.length) {
      if (item.content.text !== undefined) {
        return item
      }
      const tokens = alignRomanTokens(item.content.tokens, text)
      return tokens ? { ...item, content: makeEnrichedLineAnnotationRomanContentTokens(tokens) } : item
    }
    return makeEnrichedLineAnnotationRoman({ ...item, content: makeEnrichedLineAnnotationRomanContentText(text) })
  })
  const translations = mapShared(annotation.translations, (item) => {
    const text = insertSpaces(item.text, rules)
    if (text === item.text) {
      return item
    }
    return makeEnrichedLineAnnotationTranslation({ ...item, text })
  })
  return romans === annotation.romans && translations === annotation.translations ? annotation : { ...annotation, romans, translations }
}

/**
 * Inserts the spaces a source left out, so CJK text set against Latin letters, digits or punctuation reads evenly.
 *
 * A word-level line keeps every word's time and annotation: an inserted space becomes its own space word,
 * and split fragments share their source range while closing punctuation joins the preceding text.
 * Roman token tracks retain source timing and attributes; inserted spaces after punctuation join that token.
 * Other inserted spaces remain separate untimed tokens.
 * A track whose source data cannot survive the rewrite is kept unchanged.
 *
 * @returns The input when no rules are selected or nothing changes, or a new lyric sharing all unchanged nodes.
 */
export const insertSpacesInLines = (lyric: EnrichedLyric, options: InsertSpacesOptions = {}): EnrichedLyric => {
  const rules = resolveRules(options.rules)
  if (!rules.size) {
    return lyric
  }

  const annotations = options.annotations ?? true
  const applyToBackground = (background: EnrichedLineBackground): EnrichedLineBackground => {
    const content = applyToContent(background.content, rules) ?? undefined
    const annotation = annotations ? (applyToAnnotation(background.annotation, rules) ?? undefined) : background.annotation
    if (content === background.content && annotation === background.annotation) {
      return background
    }
    return { ...background, content, annotation }
  }

  const lines = mapShared(lyric.lines, (line) => {
    if (line.type !== EnrichedLineType.NORMAL) {
      return line
    }

    const content = applyToContent(line.content, rules) ?? undefined
    const annotation = annotations ? (applyToAnnotation(line.annotation, rules) ?? undefined) : line.annotation
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
