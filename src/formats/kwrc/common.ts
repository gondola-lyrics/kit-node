import type { LrcMetaTag } from '../lrc'

import { parseTime } from '@root/utils'

import { META_PATTERN } from '../lrc'

export const FORMAT = 'kwrc'
export const LINE_PATTERN = /^\[([^\]]*)\]/
export const WORD_PATTERN = /<(-?\d+,-?\d+(?:,-?\d+)?)>/g
export const VISIBLE_TEXT = /[^\p{White_Space}]/u

export interface KwrcContent {
  original: string
}

export interface SourceLine {
  row: number
  start: number
  text: string
  clock: boolean
}

interface SourceTrack {
  lines: SourceLine[]
  metaTags: LrcMetaTag[]
}

export interface WordScales {
  start: number
  duration: number
}

/**
 * Removes only complete encoded tags so literal angle-bracket text survives.
 */
export const readText = (text: string): string => {
  return text.replace(WORD_PATTERN, '')
}

/**
 * Accepts decoded plaintext without unwrapping XML or auxiliary tracks.
 */
export const readKwrcContent = (input: unknown): KwrcContent | null => {
  const source = typeof input === 'string' ? { original: input } : input
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return null
  }

  const original = (source as Partial<KwrcContent>).original
  if (typeof original !== 'string' || /^\s*</.test(original)) {
    return null
  }

  return { original }
}

/**
 * Retains source slots and literal bodies before word timing or bilingual boundaries are interpreted.
 */
export const readKwrcSource = (text: string): SourceTrack => {
  const lines: SourceLine[] = []
  const metaTags: LrcMetaTag[] = []

  const rows = text.replace(/^\uFEFF/, '').split(/\r\n?|\n/)
  for (const [row, raw] of rows.entries()) {
    const times: { start: number; clock: boolean }[] = []

    let body = raw.trimStart()
    let header: RegExpExecArray | null

    while ((header = LINE_PATTERN.exec(body))) {
      const tag = header[1]!.trim()
      const start = parseTime(tag)
      if (start !== undefined) {
        times.push({ start, clock: /^[\d:.]+$/.test(tag) })
      } else {
        const meta = META_PATTERN.exec(tag)
        if (!meta || times.length) {
          break
        }
        metaTags.push({ key: meta[1]!.toLowerCase(), value: meta[2]!.trim() })
      }

      body = body.slice(header[0].length)
      if (!times.length) {
        body = body.trimStart()
      }
    }

    for (const time of times) {
      lines.push({ row, ...time, text: body })
    }
  }

  return { lines, metaTags }
}

/**
 * Requires complete octal values and agreement across all parameter tags, without selecting a default scale.
 */
export const readKwrcScales = (tags: LrcMetaTag[]): WordScales | undefined => {
  let value: number | undefined
  for (const tag of tags) {
    if (tag.key !== 'kuwo') {
      continue
    }
    if (!/^[0-7]+$/.test(tag.value)) {
      return undefined
    }
    const next = Number.parseInt(tag.value, 8)
    if (!Number.isSafeInteger(next) || (value !== undefined && value !== next)) {
      return undefined
    }
    value = next
  }

  if (value === undefined) {
    return undefined
  }

  const start = Math.trunc(value / 10)
  const duration = value % 10
  return start > 0 && duration > 0 ? { start, duration } : undefined
}

/**
 * A repeated timestamp opens the previous original's translation slot before the next original.
 * The entire sequence must agree so one missing slot cannot shift all later translations.
 */
export const hasKwrcTranslations = ({ lines, metaTags }: SourceTrack): boolean => {
  const markers = metaTags.filter((tag) => tag.key === 'ml')
  if (!markers.length || markers.some((tag) => tag.value !== '1.0') || lines.length < 3 || lines.length % 2 !== 1) {
    return false
  }

  const has = lines.every((line, index) => {
    return line.clock && Number.isSafeInteger(line.start) && line.row !== lines[index - 1]?.row
  })
  if (!has) {
    return false
  }

  let previous = lines[0]!
  for (let index = 1; index < lines.length; index += 2) {
    const translation = lines[index]!
    const original = lines[index + 1]!
    if (translation.start <= previous.start || translation.start !== original.start) {
      return false
    }
    // An instrumental slot cannot carry a nonempty translation in the output model.
    if (!VISIBLE_TEXT.test(readText(previous.text)) && VISIBLE_TEXT.test(readText(translation.text))) {
      return false
    }
    previous = original
  }

  return true
}
