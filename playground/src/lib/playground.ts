import type { Diagnostic, Lyric } from '@gondola-lyrics/model/runtime'
import type { GenerateFormat, LyricFormat } from '@gondola-lyrics/kit'
import type { PlaygroundOptions } from './options'

export type SourceMode = 'auto' | LyricFormat
export type ResultView = 'preview' | 'json' | GenerateFormat

export const SOURCE_CONTENT_KEYS: Record<SourceMode, 'autoContent' | 'lrcContent' | 'qrcContent' | 'ttmlContent'> = {
  auto: 'autoContent',
  lrc: 'lrcContent',
  qrc: 'qrcContent',
  ttml: 'ttmlContent',
}

export interface PlaygroundForm {
  mode: SourceMode
  autoContent: string
  lrcContent: string
  qrcContent: string
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
