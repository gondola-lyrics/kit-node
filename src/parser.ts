export type { LyricFormat, ParseResult, LrcParseInput, LrcParseOptions, TtmlProfile, TtmlParseInput, TtmlParseOptions } from './formats'

export { detectFormat, parse, parseLrc, parseTtml } from './formats'

export type {
  DeriveWordEmphasisOptions,
  ExtractBackgroundLinesOptions,
  InsertInstrumentalLinesOptions,
  InsertSpacesOptions,
  InsertSpacesRule,
} from './transforms'

export {
  InsertSpacesRules,
  deriveWordEmphasis,
  extractBackgroundLines,
  stripBackgroundBrackets,
  insertInstrumentalLines,
  insertSpacesInLines,
} from './transforms'
