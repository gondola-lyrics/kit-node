import type { EnrichedLine, EnrichedWord, Meta, TimeRange, UnknownEntry } from '@gondola-lyrics/model'
import type { LrcMetaTag } from '../lrc'
import type { ParseResult } from '../result'
import type { KrcContent } from './common'

import {
  EnrichedLineType,
  EnrichedLyricStatus,
  TimingLevel,
  deriveEnrichedLanguageUsages,
  getEnrichedLineAnnotationRomanText,
  getEnrichedWordsText,
  hasEnrichedLineWords,
  makeEnrichedLineAnnotation,
  makeEnrichedLineAnnotationRoman,
  makeEnrichedLineAnnotationRomanContentText,
  makeEnrichedLineAnnotationTranslation,
  makeEnrichedLineContentText,
  makeEnrichedLineContentWords,
  makeEnrichedLineInstrumental,
  makeEnrichedLineNormal,
  makeEnrichedLyric,
  makeTimeRange,
  makeEnrichedWordNormal,
  makeEnrichedWordSpace,
} from '@gondola-lyrics/model'

import { finalizeLyric } from '../result'
import { attachRubies, isPlaceholderText, readRubyEntries } from '../qrc'
import { TAG_PATTERN, readLrc, readLrcMetaTags, scanWordTags } from '../lrc'
import { FORMAT, LINE_PATTERN, WORD_PATTERN, readKrcContent, readKrcLanguagePayload, readKrcMetaTag } from './common'

export type KrcParseInput = KrcContent

export interface KrcReadResult {
  lines: EnrichedLine[]
  metaTags: LrcMetaTag[]
}

const SEPARATORS = /^\p{White_Space}+$/u

const appendWords = (words: EnrichedWord[], text: string, time?: TimeRange): void => {
  for (const fragment of text.split(/(\p{White_Space}+)/u)) {
    if (!fragment) {
      continue
    }
    words.push(SEPARATORS.test(fragment) ? makeEnrichedWordSpace({ text: fragment }) : makeEnrichedWordNormal({ text: fragment, time }))
  }
}

const readLine = (body: string, start: number, duration: number): EnrichedLine => {
  const time = makeTimeRange({ start, end: start + duration })
  const pieces = scanWordTags(body, WORD_PATTERN)
  const tagged = pieces.some((piece) => piece.tag !== undefined)
  if (!tagged) {
    return body.trim() ? makeEnrichedLineNormal({ time, content: makeEnrichedLineContentText(body) }) : makeEnrichedLineInstrumental({ time })
  }

  const words: EnrichedWord[] = []
  for (const piece of pieces) {
    if (piece.tag === undefined) {
      appendWords(words, piece.text)
      continue
    }
    // Only offset and duration are used; the third field has no verified meaning.
    const [offset, wordDuration] = piece.tag.split(',').map(Number)
    const wordStart = start + offset!
    appendWords(words, piece.text, makeTimeRange({ start: wordStart, end: wordStart + wordDuration! }))
  }
  return getEnrichedWordsText(words).trim()
    ? makeEnrichedLineNormal({ time, content: makeEnrichedLineContentWords(words) })
    : makeEnrichedLineInstrumental({ time })
}

/**
 * Reads native KRC rows in source order and performs no other operation: no metadata mapping, annotation attachment, sorting, or normalization.
 *
 * Explicit line and word durations survive unchanged; whitespace splitting never reallocates segment time.
 *
 * @returns Original-order model lines and metadata tags awaiting interpretation.
 */
export const readKrc = (text: string): KrcReadResult => {
  const lines: EnrichedLine[] = []
  const metaTags: LrcMetaTag[] = []
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r\n?|\n/)) {
    const line = raw.trimStart()
    const header = LINE_PATTERN.exec(line)
    if (header) {
      lines.push(readLine(line.slice(header[0].length), Number(header[1]), Number(header[2])))
      continue
    }
    if (!line.startsWith('[')) {
      continue
    }
    for (const tag of line.matchAll(TAG_PATTERN)) {
      const meta = readKrcMetaTag(tag[1]!)
      if (meta) {
        metaTags.push(meta)
      }
    }
  }
  return { lines, metaTags }
}

// Only a fully matched kana field is consumed; partial matches keep both the attachment and the source value.
const attachKana = (lines: EnrichedLine[], meta: Meta): EnrichedLine[] => {
  for (const entry of meta.unknowns) {
    if (entry.key !== 'kana') {
      continue
    }
    const sources = readRubyEntries(entry.value)
    if (!sources) {
      continue
    }
    const attached = attachRubies(lines, sources)
    if (attached.matched.size === sources.length) {
      meta.unknowns = meta.unknowns.filter((item) => item !== entry)
    }
    return attached.lines
  }
  return lines
}

interface LanguageTrack {
  type: 0 | 1
  language: number
  lyricContent: string[][]
}

const isObject = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

const readTrack = (value: unknown): LanguageTrack | undefined => {
  if (
    !isObject(value) ||
    (value.type !== 0 && value.type !== 1) ||
    typeof value.language !== 'number' ||
    !Number.isSafeInteger(value.language) ||
    value.language < 0 ||
    !Array.isArray(value.lyricContent) ||
    !value.lyricContent.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === 'string'))
  ) {
    return undefined
  }
  return value as unknown as LanguageTrack
}

const attachTrack = (lines: EnrichedLine[], track: LanguageTrack): { lines: EnrichedLine[]; complete: boolean } => {
  let result = lines
  let complete = true
  for (const [index, cells] of track.lyricContent.entries()) {
    const text = cells.join('')
    // Multiple cells can be displayed losslessly as text, but their boundaries still need the original payload.
    if (cells.length > 1) {
      complete = false
    }
    // A slot Kugou left without a translation carries nothing to attach.
    if (!text.trim() || isPlaceholderText(text)) {
      continue
    }
    const line = result[index]!
    if (line.type === EnrichedLineType.INSTRUMENTAL) {
      complete = false
      continue
    }
    const kind = track.type === 1 ? 'translations' : 'romans'
    const existing = line.annotation?.[kind] ?? []
    const occupied = existing.find((item) => !item.language)
    if (occupied) {
      const occupiedText = 'text' in occupied ? occupied.text : getEnrichedLineAnnotationRomanText(occupied)
      complete = complete && occupiedText === text
      continue
    }
    const item =
      track.type === 1
        ? makeEnrichedLineAnnotationTranslation({ text })
        : makeEnrichedLineAnnotationRoman({ content: makeEnrichedLineAnnotationRomanContentText(text) })
    const annotated = {
      ...line,
      annotation: makeEnrichedLineAnnotation({ ...line.annotation, [kind]: [...existing, item] }),
    }
    if (result === lines) {
      result = lines.slice()
    }
    result[index] = annotated
  }
  return { lines: result, complete }
}

/**
 * Attaches strictly recognized Kugou language tracks by original timed slot before sorting or filtering.
 *
 * Existing annotations take precedence; incomplete or ambiguous payloads remain in metadata.
 * Numeric language codes other than the verified default are retained without inventing BCP 47 tags.
 *
 * @returns Annotated lines, reusing the original array when no visible content changes.
 */
const attachKugouLanguage = (lines: EnrichedLine[], meta: Meta): EnrichedLine[] => {
  if (!lines.length) {
    return lines
  }
  let result = lines
  const unknowns: UnknownEntry[] = []
  const selected = new Map<number, string[][]>()
  for (const entry of meta.unknowns) {
    const payload = entry.key === 'language' ? readKrcLanguagePayload(entry.value) : null
    if (!payload) {
      unknowns.push(entry)
      continue
    }
    let complete = Object.keys(payload).every((key) => key === 'version' || key === 'content' || key === 'contentV2')
    if ('contentV2' in payload && (!Array.isArray(payload.contentV2) || payload.contentV2.length !== 0)) {
      complete = false
    }
    for (const value of payload.content as unknown[]) {
      const track = readTrack(value)
      if (!track || track.language !== 0 || track.lyricContent.length !== lines.length) {
        complete = false
        continue
      }
      if (Object.keys(value as object).some((key) => key !== 'type' && key !== 'language' && key !== 'lyricContent')) {
        complete = false
      }
      const previous = selected.get(track.type)
      if (previous) {
        complete = complete && JSON.stringify(previous) === JSON.stringify(track.lyricContent)
        continue
      }
      selected.set(track.type, track.lyricContent)
      const attached = attachTrack(result, track)
      result = attached.lines
      complete = complete && attached.complete
    }
    if (!complete) {
      unknowns.push(entry)
    }
  }
  meta.unknowns = unknowns
  return result
}

/**
 * Parses decrypted Kugou lyrics, retaining explicit durations and attaching embedded annotations by source slot.
 *
 * A source carrying no KRC row is read as LRC, so a platform fallback keeps its container annotations.
 * Placeholder slots carry no annotation, so they never keep a credit line in the stream.
 * Kana supplies whole-word ruby; type 0 language tracks retain complete line romanization.
 * Incomplete metadata remains available in unknowns, and source timing violations remain visible in diagnostics.
 *
 * @param input Decrypted plaintext or an object containing its original text.
 *
 * @returns Canonical lyrics and model diagnostics; no readable timed rows yields INVALID status.
 */
export const parseKrc = (input: string | KrcParseInput): ParseResult => {
  const source = readKrcContent(input)
  if (!source) {
    return finalizeLyric(makeEnrichedLyric({ format: FORMAT, status: EnrichedLyricStatus.INVALID }))
  }

  const native = readKrc(source.original)
  const parsed = native.lines.length ? native : readLrc(source.original)

  const meta = readLrcMetaTags(parsed.metaTags)
  const lines = attachKugouLanguage(attachKana(parsed.lines, meta), meta)
  return finalizeLyric(
    makeEnrichedLyric({
      format: FORMAT,
      status: lines.length ? EnrichedLyricStatus.VALID : EnrichedLyricStatus.INVALID,
      timing: lines.some(hasEnrichedLineWords) ? TimingLevel.WORD : TimingLevel.LINE,
      meta,
      lines,
      languageUsages: deriveEnrichedLanguageUsages(lines),
    }),
  )
}
