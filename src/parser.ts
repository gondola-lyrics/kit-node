export type {
  LyricFormat,
  ParseResult,
  KrcParseInput,
  KwrcParseInput,
  LrcParseInput,
  LrcParseOptions,
  QrcParseInput,
  QrcParseOptions,
  TtmlProfile,
  TtmlParseInput,
  TtmlParseOptions,
  YrcParseInput,
  YrcParseOptions,
} from './formats'

export { detectFormat, parse, parseKrc, parseKwrc, parseLrc, parseQrc, parseTtml, parseYrc } from './formats'

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
