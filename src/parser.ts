export type {
  LyricFormat,
  ParseResult,
  KrcParseInput,
  LrcParseInput,
  LrcParseOptions,
  QrcParseInput,
  QrcParseOptions,
  TtmlProfile,
  TtmlParseInput,
  TtmlParseOptions,
} from './formats'

export { detectFormat, parse, parseKrc, parseLrc, parseQrc, parseTtml } from './formats'

export type {
  DeriveWordEmphasisOptions,
  ExtractAgentsOptions,
  ExtractBackgroundLinesOptions,
  ExtractCreditsOptions,
  InsertInstrumentalLinesOptions,
  InsertSpacesOptions,
  InsertSpacesRule,
  RemoveNonLyricLinesOptions,
} from './transforms'

export {
  DEFAULT_CREDIT_NAME_SEPARATORS,
  InsertSpacesRules,
  NON_LYRIC_CATEGORIES,
  deriveWordEmphasis,
  extractAgents,
  extractBackgroundLines,
  extractCredits,
  removeNonLyricLines,
  stripBackgroundBrackets,
  insertInstrumentalLines,
  insertSpacesInLines,
} from './transforms'
