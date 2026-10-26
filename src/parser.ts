export type { LyricFormat, ParseResult, LrcParseInput, LrcParseOptions, TtmlProfile, TtmlParseInput, TtmlParseOptions } from './formats'

export { detectFormat, parse, parseLrc, parseTtml } from './formats'

export type { DeriveWordEmphasisOptions, InsertInstrumentalLinesOptions } from './transforms'

export { deriveWordEmphasis, insertInstrumentalLines } from './transforms'
