import type { runtime } from '@gondola-lyrics/model'
import type { LrcMetaTag } from '../lrc'
import type { ParseResult } from '../result'
import type { KrcContent } from './common'

import {
  LineType,
  LyricStatus,
  Timing,
  deriveLanguageUsages,
  getWordsText,
  isWordLevelLine,
  makeLineAnnotation,
  makeLineAnnotationRoman,
  makeLineAnnotationTranslation,
  makeLineContentText,
  makeLineContentWords,
  makeLineInstrumental,
  makeLineNormal,
  makeLyric,
  makeTimeRange,
  makeWordNormal,
  makeWordSpace,
} from '@gondola-lyrics/model/runtime'

import { finalizeLyric } from '../result'
import { attachRubies, isPlaceholderText, readRubyEntries } from '../qrc'
import { decodeBase64 } from '@root/utils'

import { META_PATTERN, TAG_PATTERN, readLrc, readLrcMetaTags, scanWordTags } from '../lrc'
import { FORMAT, LINE_PATTERN, WORD_PATTERN, readKrcContent } from './common'

export type KrcParseInput = KrcContent

export interface KrcReadResult {
  lines: runtime.Line[]
  metaTags: LrcMetaTag[]
}

const SEPARATORS = /^\p{White_Space}+$/u

const appendWords = (words: runtime.Word[], text: string, time?: runtime.TimeRange): void => {
  for (const fragment of text.split(/(\p{White_Space}+)/u)) {
    if (!fragment) {
      continue
    }
    words.push(SEPARATORS.test(fragment) ? makeWordSpace({ text: fragment }) : makeWordNormal({ text: fragment, time }))
  }
}

const readLine = (body: string, start: number, duration: number): runtime.Line => {
  const time = makeTimeRange({ start, end: start + duration })
  const pieces = scanWordTags(body, WORD_PATTERN)
  const tagged = pieces.some((piece) => piece.tag !== undefined)
  if (!tagged) {
    return body.trim() ? makeLineNormal({ time, content: makeLineContentText(body) }) : makeLineInstrumental({ time })
  }

  const words: runtime.Word[] = []
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
  return getWordsText(words).trim() ? makeLineNormal({ time, content: makeLineContentWords(words) }) : makeLineInstrumental({ time })
}

/**
 * Reads native KRC rows in source order and performs no other operation: no metadata mapping, annotation attachment, sorting, or normalization.
 *
 * Explicit line and word durations survive unchanged; whitespace splitting never reallocates segment time.
 *
 * @returns Original-order model lines and metadata tags awaiting interpretation.
 */
export const readKrc = (text: string): KrcReadResult => {
  const lines: runtime.Line[] = []
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
      const meta = META_PATTERN.exec(tag[1]!)
      if (meta) {
        metaTags.push({ key: meta[1]!.toLowerCase(), value: meta[2]!.trim() })
      }
    }
  }
  return { lines, metaTags }
}

// Only a fully matched kana field is consumed; partial matches keep both the attachment and the source value.
const attachKana = (lines: runtime.Line[], meta: runtime.Meta): runtime.Line[] => {
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

// Payload recognition stays strict: plain tags and coincidental base64 must never pass as Kugou data.
const readPayload = (value: string): Record<string, unknown> | undefined => {
  const bytes = decodeBase64(value)
  if (!bytes) {
    return undefined
  }
  try {
    const payload: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    return isObject(payload) && payload.version === 1 && Array.isArray(payload.content) ? payload : undefined
  } catch {
    return undefined
  }
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

const attachTrack = (lines: runtime.Line[], track: LanguageTrack): { lines: runtime.Line[]; complete: boolean } => {
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
    if (line.type === LineType.INSTRUMENTAL) {
      complete = false
      continue
    }
    const kind = track.type === 1 ? 'translations' : 'romans'
    const existing = line.annotation?.[kind] ?? []
    const occupied = existing.find((item) => !item.language)
    if (occupied) {
      complete = complete && occupied.text === text
      continue
    }
    const create = track.type === 1 ? makeLineAnnotationTranslation : makeLineAnnotationRoman
    const annotated = {
      ...line,
      annotation: makeLineAnnotation({ ...line.annotation, [kind]: [...existing, create({ text })] }),
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
const attachKugouLanguage = (lines: runtime.Line[], meta: runtime.Meta): runtime.Line[] => {
  if (!lines.length) {
    return lines
  }
  let result = lines
  const unknowns: runtime.UnknownEntry[] = []
  const selected = new Map<number, string[][]>()
  for (const entry of meta.unknowns) {
    const payload = entry.key === 'language' ? readPayload(entry.value) : undefined
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
    return finalizeLyric(makeLyric({ format: FORMAT, status: LyricStatus.INVALID }))
  }

  const native = readKrc(source.original)
  const parsed = native.lines.length ? native : readLrc(source.original)

  const meta = readLrcMetaTags(parsed.metaTags)
  const lines = attachKugouLanguage(attachKana(parsed.lines, meta), meta)
  return finalizeLyric(
    makeLyric({
      format: FORMAT,
      status: lines.length ? LyricStatus.VALID : LyricStatus.INVALID,
      timing: lines.some(isWordLevelLine) ? Timing.WORD : Timing.LINE,
      meta,
      lines,
      languages: deriveLanguageUsages(lines),
    }),
  )
}
