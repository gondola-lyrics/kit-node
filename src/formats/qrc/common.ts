import type { XmlElement } from '@root/utils'

import { XmlNodeType, getXmlAttribute, parseXml } from '@root/utils'

export const FORMAT = 'qrc'
export const LINE_PATTERN = /^\[(\d+),(\d+)\]/

export interface QrcContent {
  original: string
  translations?: string
  romans?: string
}

const XML_ROOT_NAMES = ['QrcInfos', 'LyricInfo', 'Lyric_1']
const XML_PATTERN = /^\s*</
const TIMED_LINE_PATTERN = /(?:^|[\r\n])[^\S\r\n]*\[\d+,\d+\]/

/**
 * Unwraps supported QRC XML while keeping plaintext literal.
 *
 * XML entities are decoded once by the XML reader.
 *
 * @returns The payload, or null when XML is malformed or has no supported lyric content.
 */
export const readText = (source: string): string | null => {
  if (!XML_PATTERN.test(source)) {
    return source
  }
  // Reject unrelated XML before building a document tree.
  if (!XML_ROOT_NAMES.some((name) => source.includes(name))) {
    return null
  }

  const document = parseXml(source)
  if (document === null) {
    return null
  }
  const root = document.children.find((node): node is XmlElement => node.nodeType === XmlNodeType.element)
  if (root === undefined || !XML_ROOT_NAMES.includes(root.localName)) {
    return null
  }

  const pending = [root]
  while (pending.length > 0) {
    const element = pending.pop()!
    const content = getXmlAttribute(element, 'LyricContent')
    if (content !== undefined) {
      return content
    }
    for (let index = element.children.length - 1; index >= 0; index -= 1) {
      const child = element.children[index]!
      if (child.nodeType === XmlNodeType.element) {
        pending.push(child)
      }
    }
  }
  return null
}

/**
 * Validates the original payload and keeps auxiliary tracks separate so each can use its own format.
 *
 * @returns Normalized input, or null when the original content cannot be read.
 */
export const readContent = (input: unknown): QrcContent | null => {
  const value = typeof input === 'string' ? { original: input } : input
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const source = value as Partial<QrcContent>
  if (typeof source.original !== 'string') {
    return null
  }
  const original = readText(source.original)
  if (original === null) {
    return null
  }
  return {
    original,
    translations: typeof source.translations === 'string' ? source.translations : undefined,
    romans: typeof source.romans === 'string' ? source.romans : undefined,
  }
}

/**
 * Requires a timed QRC row so metadata alone cannot select the format.
 */
export const hasTimedLines = (text: string): boolean => {
  return TIMED_LINE_PATTERN.test(text)
}
