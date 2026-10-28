import type { InsertSpacesRule } from './constants'

import { INSERT_SPACES_RULES, InsertSpacesRules } from './constants'

// Kana, CJK extensions, unified ideographs and compatibility ideographs.
const CJK_RANGE = '\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff'
const LATIN_RANGE = 'A-Za-z'
const DIGIT_RANGE = '0-9'
const SYMBOL_RANGE = '!@#$%^&+\\-=/|<>'
const WORD_RANGE = `${LATIN_RANGE}${DIGIT_RANGE}${CJK_RANGE}`
const ALL_RANGE = `${WORD_RANGE}${SYMBOL_RANGE}`

const CJK_LATIN = new RegExp(`([${CJK_RANGE}])([${LATIN_RANGE}])`, 'gu')
const LATIN_CJK = new RegExp(`([${LATIN_RANGE}])([${CJK_RANGE}])`, 'gu')
const CJK_DIGIT = new RegExp(`([${CJK_RANGE}])([${DIGIT_RANGE}])`, 'gu')
const DIGIT_CJK = new RegExp(`([${DIGIT_RANGE}])([${CJK_RANGE}])`, 'gu')

const PUNCTUATION = new RegExp(`([${ALL_RANGE}])([!;,\\?:])(?=[${ALL_RANGE}])`, 'gu')
const QUOTE_BEFORE = new RegExp(`([${CJK_RANGE}${LATIN_RANGE}${DIGIT_RANGE}])(["\`“‘])`, 'gu')
const QUOTE_AFTER = new RegExp(`(["”’])([${CJK_RANGE}${LATIN_RANGE}${DIGIT_RANGE}])`, 'gu')
const BRACKET_BEFORE = new RegExp(`([${WORD_RANGE}])([\\[({<])`, 'gu')
const BRACKET_AFTER = new RegExp(`([\\])}>])([${WORD_RANGE}])`, 'gu')
const MATH_OPERATOR = new RegExp(`([${ALL_RANGE}])([+=&])(?=[${ALL_RANGE}])`, 'gu')
const HYPHEN = new RegExp(`(?<=[${WORD_RANGE}])-(?=[${WORD_RANGE}])`, 'gu')
const SLASH = new RegExp(`([${WORD_RANGE}])(/)(?=[${WORD_RANGE}])`, 'gu')
const TRIM_INSIDE_SYMBOLS = new RegExp('([<[{"“‘(])\\s*([^<>[\\]{}()"“‘”’]*?)\\s*([>\\]}"”’)])', 'gu')
const REPEATED_SPACES = / {2,}/gu

// A run of two or more marks belongs together: `a--b`, `a//b`, `a...b`, `a::b` and `a+=b` stay as written.
const REPEATED_MARKS = /[!;,\\?:+\-=/&]{2,}/gu

// A control character stands in for a held run, since lyric text never carries one and no rule's character class covers it.
const PLACEHOLDER = /\u0001(\d+)\u0001/gu

const isDigit = (char: string | undefined) => {
  return char !== undefined && char >= '0' && char <= '9'
}

const isLatin = (char: string | undefined) => {
  return char !== undefined && ((char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z'))
}

/**
 * A comma or colon between two digits belongs to one number or clock time, so it stays tight.
 */
const applyPunctuation = (text: string) => {
  return text.replace(PUNCTUATION, (match, before: string, mark: string, offset: number, source: string) => {
    if ((mark === ',' || mark === ':') && isDigit(before) && isDigit(source[offset + match.length])) {
      return match
    }
    return `${before}${mark} `
  })
}

/**
 * A hyphen between two digits is a date, range or phone number, and one between two Latin letters joins a compound word.
 *
 * An edge hyphen is left alone, since it reads as a sign or a list marker rather than a dash.
 */
const applyHyphen = (text: string) => {
  return text.replace(HYPHEN, (match, offset: number, source: string) => {
    const left = source[offset - 1]
    const right = source[offset + 1]
    return (isDigit(left) && isDigit(right)) || (isLatin(left) && isLatin(right)) ? match : ' - '
  })
}

/**
 * A slash between two digits is a fraction or date, so it stays tight.
 */
const applySlash = (text: string) => {
  return text.replace(SLASH, (match, before: string, slash: string, offset: number, source: string) => {
    return isDigit(before) && isDigit(source[offset + match.length]) ? match : `${before} ${slash} `
  })
}

/**
 * Trims the spaces just inside a bracket or quotation mark, without touching a nested pair inside it.
 */
const applyTrimInsideSymbols = (text: string) => {
  return text.replace(TRIM_INSIDE_SYMBOLS, (match, left: string, inner: string, right: string) => {
    return `${left}${inner.trim()}${right}`
  })
}

const APPLIERS: Record<InsertSpacesRule, (text: string) => string> = {
  [InsertSpacesRules.CJK_ENGLISH]: (text) => {
    return text.replace(CJK_LATIN, '$1 $2').replace(LATIN_CJK, '$1 $2')
  },
  [InsertSpacesRules.CJK_NUMBER]: (text) => {
    return text.replace(CJK_DIGIT, '$1 $2').replace(DIGIT_CJK, '$1 $2')
  },
  [InsertSpacesRules.PUNCTUATION]: applyPunctuation,
  [InsertSpacesRules.QUOTE]: (text) => {
    return text.replace(QUOTE_BEFORE, '$1 $2').replace(QUOTE_AFTER, '$1 $2')
  },
  [InsertSpacesRules.BRACKET_OUTSIDE]: (text) => {
    return text.replace(BRACKET_BEFORE, '$1 $2').replace(BRACKET_AFTER, '$1 $2')
  },
  [InsertSpacesRules.MATH_OPERATOR]: (text) => {
    return text.replace(MATH_OPERATOR, '$1 $2 ')
  },
  [InsertSpacesRules.HYPHEN]: applyHyphen,
  [InsertSpacesRules.SLASH]: applySlash,
  [InsertSpacesRules.COMPRESS_SPACES]: (text) => {
    return text.replace(REPEATED_SPACES, ' ')
  },
  [InsertSpacesRules.TRIM_INSIDE_SYMBOLS]: applyTrimInsideSymbols,
}

// Order matters: separating marks first, then tidying the spaces they may have doubled.
const APPLY_ORDER: InsertSpacesRule[] = [
  InsertSpacesRules.CJK_ENGLISH,
  InsertSpacesRules.CJK_NUMBER,
  InsertSpacesRules.PUNCTUATION,
  InsertSpacesRules.QUOTE,
  InsertSpacesRules.BRACKET_OUTSIDE,
  InsertSpacesRules.MATH_OPERATOR,
  InsertSpacesRules.HYPHEN,
  InsertSpacesRules.SLASH,
  InsertSpacesRules.TRIM_INSIDE_SYMBOLS,
  InsertSpacesRules.COMPRESS_SPACES,
]

/**
 * Falls back to every rule only when no list was given, so an explicit empty list means "apply nothing".
 */
export const resolveRules = (rules: InsertSpacesRule[] | undefined) => {
  return new Set(rules ?? INSERT_SPACES_RULES)
}

/**
 * Applies the selected rules to one text, returning it trimmed.
 *
 * Repeated marks are held aside first, so a rule that widens a single mark never splits a run that belongs together.
 */
export const insertSpaces = (text: string, rules: Set<InsertSpacesRule>) => {
  if (!text.trim()) {
    return text
  }

  const held: string[] = []
  const guarded = text.replace(REPEATED_MARKS, (match) => {
    held.push(match)
    return `\u0001${held.length - 1}\u0001`
  })

  let result = guarded
  for (const rule of APPLY_ORDER) {
    if (rules.has(rule)) {
      result = APPLIERS[rule](result)
    }
  }
  return result
    .replace(PLACEHOLDER, (match, index: string) => {
      return held[Number(index)] ?? match
    })
    .trim()
}
