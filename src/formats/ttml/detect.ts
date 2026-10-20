import { parseXml, XmlNodeType } from '@root/utils'

import { AMLL_HINT_PATTERN, ITUNES_HINT_PATTERN, readTtmlContent } from './common'

/**
 * Recognition needs a profile hint, since plain TTML says nothing about which profile wrote it.
 *
 * A bare `tt` root also counts, which is what a hand-written document has.
 * This is a format probe, not a validity check, so an input of another shape is simply not TTML.
 */
export const detectTtml = (input: unknown) => {
  const content = readTtmlContent(input)
  if (!content) {
    return false
  }

  if (AMLL_HINT_PATTERN.test(content.original) || ITUNES_HINT_PATTERN.test(content.original)) {
    return true
  }

  // A document without a hint still counts when its root is a tt element.
  const root = parseXml(content.original)
  if (!root) {
    return false
  }

  for (const child of root.children) {
    if (child.nodeType === XmlNodeType.element && child.localName === 'tt') {
      return true
    }
  }

  return false
}
