export type { LyricFormat, ParseResult, LrcParseInput, LrcParseOptions, TtmlProfile, TtmlParseInput, TtmlParseOptions } from './formats'

export { detectFormat, parse, parseLrc, parseTtml } from './formats'

export type {
  DeriveWordEmphasisOptions,
  ExtractBackgroundLinesOptions,
  ExtractCreditsOptions,
  InsertInstrumentalLinesOptions,
  InsertSpacesOptions,
  InsertSpacesRule,
} from './transforms'

export {
  DEFAULT_CREDIT_NAME_SEPARATORS,
  InsertSpacesRules,
  deriveWordEmphasis,
  extractBackgroundLines,
  extractCredits,
  stripBackgroundBrackets,
  insertInstrumentalLines,
  insertSpacesInLines,
} from './transforms'
