import { isTime } from '@root/utils'

import { TAG_PATTERN } from '../lrc'
import { LINE_PATTERN, readKrcContent, readKrcLanguagePayload, readKrcMetaTag } from './common'

/**
 * Recognizes native KRC from a duration line carrying a complete three-field word tag, or from the Kugou language container.
 *
 * Language containers are checked only where the selected native or LRC reader accepts metadata.
 *
 * @returns Whether the original plaintext contains a strong KRC syntax signal.
 */
export const detectKrc = (input: unknown): boolean => {
  const source = readKrcContent(input)
  if (!source) {
    return false
  }

  const metadataLines: string[] = []
  let native = false
  for (const raw of source.original.split(/\r\n?|\n/)) {
    const line = raw.trimStart()
    const header = LINE_PATTERN.exec(line)
    if (header) {
      native = true
      if (/<\d+,\d+,\d+>/.test(line.slice(header[0].length))) {
        return true
      }
    } else if (line.startsWith('[')) {
      metadataLines.push(line)
    }
  }

  for (const line of metadataLines) {
    let cursor = 0
    for (const tag of line.matchAll(TAG_PATTERN)) {
      const body = tag[1]!
      // LRC metadata stops at the first timestamp or literal text; native KRC scans the whole metadata row.
      if (!native && (line.slice(cursor, tag.index).trim() || isTime(body))) {
        break
      }
      const meta = readKrcMetaTag(body)
      if (!meta) {
        if (!native) {
          break
        }
        continue
      }
      if (meta.key === 'language' && readKrcLanguagePayload(meta.value)) {
        return true
      }
      cursor = tag.index + tag[0].length
    }
  }
  return false
}
