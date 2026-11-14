import { XmlNodeType, parseXml } from '@root/utils'

import { readTtmlContent } from './common'

/**
 * Recognizes a readable XML document with one `tt` root and only whitespace text outside it.
 *
 * The root may carry a namespace prefix, and lyric content need not be valid for recognition.
 */
export const detectTtml = (input: unknown): boolean => {
  const content = readTtmlContent(input)
  if (!content || !/^\s*</.test(content)) {
    return false
  }

  const document = parseXml(content)
  if (!document) {
    return false
  }

  let foundRoot = false
  for (const child of document.children) {
    if (child.nodeType === XmlNodeType.element) {
      if (foundRoot || child.localName !== 'tt') {
        return false
      }
      foundRoot = true
    } else if (child.nodeType !== XmlNodeType.text || child.text.trim()) {
      return false
    }
  }

  return foundRoot
}
