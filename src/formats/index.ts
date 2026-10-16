import type { runtime } from '@gondola-lyrics/model'

import { detectLrc, parseLrc } from './lrc'

/**
 * The format the text is written in, or undefined when nothing recognises it.
 * Separate from reading it, since a caller often wants only to know what it holds.
 */
export const detectFormat = (text: string) => {
  if (detectLrc(text)) {
    return 'lrc'
  }

  return undefined
}

/**
 * Reads source text, letting the formats decide which one recognises it.
 * Returns null when no format recognises the text, since a lyric nothing was read from is not a lyric.
 * A format that does recognise it always yields a lyric, whose `status` says whether it read well.
 * The switch has no default on purpose: a format added to `LyricFormat` and not read here leaves a path returning nothing, which the compiler reports.
 */
export const parse = (text: string): runtime.Lyric | null => {
  const format = detectFormat(text)
  if (!format) {
    return null
  }

  switch (format) {
    case 'lrc':
      return parseLrc(text)
  }
}
