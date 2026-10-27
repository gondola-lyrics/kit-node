import type { Diagnostic, Lyric } from '@gondola-lyrics/model/runtime'
import type { LyricFormat } from '@gondola-lyrics/kit'
import type { PlaygroundOptions } from './options'

export type SourceMode = 'auto' | LyricFormat
export type ResultView = 'preview' | 'json' | LyricFormat

export interface PlaygroundForm {
  mode: SourceMode
  autoContent: string
  lrcContent: string
  ttmlContent: string
  translations: string
  romans: string
  options: PlaygroundOptions
}

export interface PlaygroundResult {
  lyric: Lyric
  diagnostics: Diagnostic[]
  elapsed: number
  inputBytes: number
  encodedBytes: number | null
  encodingError: string
  options: PlaygroundOptions
}
