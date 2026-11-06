import { detectLrc } from '../lrc'
import { LINE_PATTERN, WORD_PATTERN, readYrcContent } from './common'
import { readJsonLine } from './parser'

/**
 * Recognizes native word tags or a JSON display line accompanied by LRC content in the original track.
 *
 * @returns Whether the original plaintext carries a YRC signal stronger than its shared QRC line header.
 */
export const detectYrc = (input: unknown): boolean => {
  const source = readYrcContent(input)
  if (!source) {
    return false
  }
  let display = false
  const fallback: string[] = []
  for (const raw of source.original.split(/\r\n?|\n/)) {
    const line = raw.trimStart()
    const header = LINE_PATTERN.exec(line)
    if (header && line.slice(header[0].length).match(WORD_PATTERN)) {
      return true
    }
    if (line.startsWith('{')) {
      display = display || !!readJsonLine(line)
    } else {
      fallback.push(raw)
    }
  }
  return display && detectLrc(fallback.join('\n'))
}
