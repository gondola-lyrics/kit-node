import type { runtime } from '@gondola-lyrics/model'
import type { ParseResult } from '../result'
import type { LrcContent } from './common'
import type { LrcMetaTag } from './reader'

import { LyricStatus, Timing, deriveLanguageUsages, makeLyric, makeMeta, makeText, makeUnknownEntry } from '@gondola-lyrics/model/runtime'

import { attachAnnotations, parseTime } from '@root/utils'

import { finalizeLyric } from '../result'
import { readLrc } from './reader'
import { FORMAT, readLrcContent } from './common'

export interface LrcParseOptions {
  /**
   * How far an annotation's timestamp may sit from a line's start, in milliseconds.
   * Defaults to `0`, which requires an exact match.
   */
  annotationTolerance?: number
  /**
   * Maximum roman token drift outside a matched word, in milliseconds; matched boundaries are adjusted to that word.
   * Original word timing is preserved, and incomplete word matches retain the source line romanization.
   *
   * @default 0
   */
  wordAnnotationTolerance?: number
}

export type LrcParseInput = LrcContent

const isBareNumber = (value: string) => {
  return /^\d+$/.test(value.trim())
}

/**
 * Unmapped tags and unparseable durations remain in `unknowns` to avoid discarding metadata.
 * Keys are lowercased and values trimmed, so original tag spelling is not preserved.
 */
const readMetaTags = (tags: LrcMetaTag[]) => {
  const meta = makeMeta()

  for (const tag of tags) {
    switch (tag.key) {
      case 'length':
      case 'duration': {
        // Duration tags accept both clock notation and integer milliseconds.
        const duration = parseTime(tag.value) ?? (isBareNumber(tag.value) ? Number(tag.value) : Number.NaN)
        if (Number.isFinite(duration)) {
          meta.duration = Math.trunc(duration)
        } else {
          meta.unknowns.push(makeUnknownEntry({ key: tag.key, value: tag.value }))
        }
        break
      }
      case 'offset':
        meta.offset = Math.trunc(Number(tag.value)) || 0
        break
      case 'ti':
      case 'title':
        meta.titles.push(makeText({ text: tag.value }))
        break
      case 'ar':
      case 'artist':
        meta.artists.push(makeText({ text: tag.value }))
        break
      case 'al':
      case 'album':
        meta.albums.push(makeText({ text: tag.value }))
        break
      case 'by':
      case 'author':
        meta.authors.push(makeText({ text: tag.value }))
        break
      case 'isrc':
        meta.isrcs.push(tag.value)
        break
      default:
        meta.unknowns.push(makeUnknownEntry({ key: tag.key, value: tag.value }))
        break
    }
  }

  return meta
}

const parseLrcText = (text: string): runtime.Lyric => {
  const { lines, metaTags } = readLrc(text)
  const meta = readMetaTags(metaTags)

  if (lines.length === 0) {
    return makeLyric({ format: FORMAT, status: LyricStatus.INVALID, meta })
  }

  const wordTimed = lines.some((line) => (line.content?.words.length ?? 0) > 0)

  return makeLyric({
    format: FORMAT,
    status: LyricStatus.VALID,
    timing: wordTimed ? Timing.WORD : Timing.LINE,
    meta,
    languages: deriveLanguageUsages(lines),
    lines,
  })
}

/**
 * Empty timed rows become instrumental lines; source order and missing word times remain for model validation.
 *
 * Annotation tracks are read as lines too and attached by timestamp, and rows that match no line are dropped.
 * Complete timed roman tracks attach to words; other roman tracks retain their source line text.
 *
 * `INVALID` means no readable timed lines; the returned diagnostics carry whatever the canonical tree breaks.
 */
export const parseLrc = (input: string | LrcParseInput, options: LrcParseOptions = {}): ParseResult => {
  const source = readLrcContent(input) ?? { original: '' }
  const lyric = parseLrcText(source.original)

  if (lyric.status === LyricStatus.INVALID) {
    return finalizeLyric(lyric)
  }

  const translations = source.translations === undefined ? [] : readLrc(source.translations).lines
  const romans = source.romans === undefined ? [] : readLrc(source.romans).lines
  if (translations.length === 0 && romans.length === 0) {
    return finalizeLyric(lyric)
  }

  const lines = attachAnnotations(
    lyric.lines,
    { translations, romans },
    {
      tolerance: options.annotationTolerance,
      wordTolerance: options.wordAnnotationTolerance,
    },
  )

  return finalizeLyric({ ...lyric, lines })
}
