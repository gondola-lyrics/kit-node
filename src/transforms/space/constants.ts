/**
 * Groups of characters a source may write without a space where one belongs.
 */
export const InsertSpacesRules = {
  /**
   * A CJK character touching a Latin letter, as in `ABC中文`.
   */
  CJK_ENGLISH: 'cjkEnglish',
  /**
   * A CJK character touching a digit, as in `2026年`.
   */
  CJK_NUMBER: 'cjkNumber',
  /**
   * A comma, semicolon, exclamation mark, question mark or colon touching a character, as in `a,b`; a clock time or thousands separator such as `10:30` stays as written.
   */
  PUNCTUATION: 'punctuation',
  /**
   * A quotation mark touching a neighbouring character.
   */
  QUOTE: 'quote',
  /**
   * A bracket touching the character outside it.
   */
  BRACKET_OUTSIDE: 'bracketOutside',
  /**
   * A plus, equals or ampersand touching a character, as in `a+b`; a compound operator such as `a+=b` stays as written.
   */
  MATH_OPERATOR: 'mathOperator',
  /**
   * A hyphen touching a CJK character, as in `中-文`; a compound word such as `well-known` stays as written.
   */
  HYPHEN: 'hyphen',
  /**
   * A slash touching a character, as in `and/or`; a fraction such as `1/2` stays as written.
   */
  SLASH: 'slash',
  /**
   * Runs of two or more spaces, collapsed to one.
   */
  COMPRESS_SPACES: 'compressSpaces',
  /**
   * Spaces just inside a bracket or quotation mark, removed.
   */
  TRIM_INSIDE_SYMBOLS: 'trimInsideSymbols',
} as const

export type InsertSpacesRule = (typeof InsertSpacesRules)[keyof typeof InsertSpacesRules]

export const INSERT_SPACES_RULES = Object.values(InsertSpacesRules) as InsertSpacesRule[]
