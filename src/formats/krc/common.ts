import type { LrcMetaTag } from '../lrc'

import { decodeBase64AsText } from '@root/utils'

import { META_PATTERN } from '../lrc'

export const FORMAT = 'krc'
export const LINE_PATTERN = /^\[(\d+),(\d+)\]/
export const WORD_PATTERN = /<(\d+,\d+,\d+)>/g

export interface KrcContent {
  original: string
}

/**
 * Reads decrypted plaintext without unwrapping XML or accepting auxiliary tracks.
 *
 * @returns Original content, or null when the input cannot be read as plaintext KRC.
 */
export const readKrcContent = (input: unknown): KrcContent | null => {
  const source = typeof input === 'string' ? { original: input } : input
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return null
  }
  const original = (source as Partial<KrcContent>).original
  if (typeof original !== 'string' || /^\s*</.test(original)) {
    return null
  }
  return { original }
}

/**
 * Normalizes metadata keys and values identically for detection and parsing.
 */
export const readKrcMetaTag = (body: string): LrcMetaTag | null => {
  const match = META_PATTERN.exec(body)
  if (!match) {
    return null
  }
  return { key: match[1]!.toLowerCase(), value: match[2]!.trim() }
}

/**
 * Recognizes the Kugou container independently of JSON formatting while leaving track support to the parser.
 */
export const readKrcLanguagePayload = (value: string): Record<string, unknown> | null => {
  const text = decodeBase64AsText(value)
  if (text === null) {
    return null
  }
  try {
    const payload: unknown = JSON.parse(text)
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null
    }
    const container = payload as Record<string, unknown>
    return container.version === 1 && Array.isArray(container.content) ? container : null
  } catch {
    return null
  }
}
