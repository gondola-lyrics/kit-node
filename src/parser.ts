export type { LyricFormat, ParseResult, LrcParseInput, LrcParseOptions, TtmlProfile, TtmlParseInput, TtmlParseOptions } from './formats'

export { detectFormat, parse, parseLrc, parseTtml } from './formats'

export type { InsertInstrumentalLinesOptions } from './transforms'

export { insertInstrumentalLines } from './transforms'
