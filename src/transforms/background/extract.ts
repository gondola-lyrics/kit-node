import type { runtime } from '@gondola-lyrics/model'

import {
  LineType,
  Timing,
  deriveLanguageUsages,
  makeLineAnnotation,
  makeLineAnnotationRoman,
  makeLineAnnotationTranslation,
  makeLineBackground,
  makeLineContentText,
  makeLineContentWords,
  makeTimeRange,
} from '@gondola-lyrics/model/runtime'

import { isCloseBracket, isNormalWord, isOpenBracket, readLineText, readTimeRange } from './utils'

export interface ExtractBackgroundLinesOptions {
  /**
   * Turn a line holding nothing but brackets into a background line of the line before it.
   *
   * @default true
   */
  fullLine?: boolean
  /**
   * Pull the bracketed runs inside a line out into background lines of that same line.
   *
   * @default true
   */
  inLine?: boolean
  /**
   * Join a bracket opened on one line and closed on a later one, attaching it to the line before them.
   *
   * @default true
   */
  crossLine?: boolean
}

interface TextRun {
  text: string
  start: number
  end: number
}

/**
 * An unclosed bracket never became a run, so its text returns to the line it came from.
 * An empty pair yields no run, since a background line must carry text.
 */
const splitText = (text: string) => {
  const chars = [...text]
  let main = ''
  let current = ''
  let opened = ''
  let openedAt = 0
  let depth = 0
  const runs: TextRun[] = []

  for (const [index, char] of chars.entries()) {
    if (isOpenBracket(char)) {
      if (depth) {
        current += char
      } else {
        opened = char
        openedAt = index
      }
      depth += 1
    } else if (isCloseBracket(char)) {
      if (depth === 0) {
        main += char
        continue
      }
      depth -= 1
      if (depth) {
        current += char
      } else {
        runs.push({ text: current, start: openedAt + 1, end: index })
        current = ''
      }
    } else if (depth) {
      current += char
    } else {
      main += char
    }
  }

  if (depth) {
    main += opened + current
  }
  // A removed run leaves the separators that framed it behind, so they collapse rather than double.
  return {
    main: main.trim().replaceAll(/\s{2,}/gu, ' '),
    runs: runs.filter((run) => {
      return run.text.trim() !== ''
    }),
    length: chars.length,
  }
}
/**
 * A word straddling a bracket is cut into pieces sharing its time, since the source gave no finer boundary.
 * An unclosed bracket never became a run, so its text returns to the line it came from.
 * An empty pair yields no run, since a background line must carry text.
 */
const splitWords = (words: runtime.Word[]) => {
  const main: runtime.Word[] = []
  const runs: runtime.Word[][] = []
  let current: runtime.Word[] = []
  let opened: runtime.Word | undefined
  let depth = 0

  for (const word of words) {
    if (!isNormalWord(word)) {
      const target = depth ? current : main
      target.push(word)
      continue
    }

    let buffer = ''
    for (const char of word.text) {
      if (isOpenBracket(char)) {
        if (depth) {
          buffer += char
        } else {
          if (buffer) {
            main.push({ ...word, text: buffer })
            buffer = ''
          }
          opened = { ...word, text: char }
        }
        depth += 1
      } else if (isCloseBracket(char)) {
        if (depth === 0) {
          buffer += char
          continue
        }
        depth -= 1
        if (depth) {
          buffer += char
        } else {
          if (buffer) {
            current.push({ ...word, text: buffer })
            buffer = ''
          }
          if (current.length) {
            runs.push(current)
            current = []
          }
        }
      } else {
        buffer += char
      }
    }

    if (buffer) {
      const target = depth ? current : main
      target.push({ ...word, text: buffer })
    }
  }

  if (depth) {
    if (opened) {
      main.push(opened)
    }
    main.push(...current)
  }
  return {
    main,
    runs: runs.filter((run) => {
      return run.some((word) => {
        return word.text.trim() !== ''
      })
    }),
  }
}

const mapSpan = (range: runtime.TimeRange, length: number, run: TextRun) => {
  if (range.end === undefined || length === 0) {
    return makeTimeRange({ start: range.start, end: range.end })
  }
  const span = range.end - range.start
  const start = range.start + Math.round((span * run.start) / length)
  const end = range.start + Math.round((span * run.end) / length)
  return makeTimeRange({ start, end: Math.max(start, end) })
}

/**
 * Falls back to the line's own range when no word carries a time, so a run still gets a range.
 */
const readWordRange = (words: runtime.Word[], fallback: runtime.TimeRange) => {
  const timed = words.filter((word) => {
    return isNormalWord(word) && word.time !== undefined
  })
  const first = timed[0]?.time
  const last = timed.at(-1)?.time
  if (!first || !last) {
    return fallback
  }
  return makeTimeRange({ start: first.start, end: last.end })
}

/**
 * A background may start before its line but not finish after it, so the line grows to the furthest stated end.
 */
const attach = (line: runtime.Line, backgrounds: runtime.LineBackground[]) => {
  const merged = [...line.backgrounds, ...backgrounds]
  merged.sort((left, right) => {
    const leftStart = left.time?.start ?? 0
    const rightStart = right.time?.start ?? 0
    return leftStart === rightStart ? (left.time?.end ?? 0) - (right.time?.end ?? 0) : leftStart - rightStart
  })

  let end = line.time?.end
  for (const background of merged) {
    const backgroundEnd = background.time?.end
    if (backgroundEnd !== undefined && (end === undefined || backgroundEnd > end)) {
      end = backgroundEnd
    }
  }
  if (!line.time || end === line.time.end) {
    return { ...line, backgrounds: merged }
  }
  return { ...line, time: makeTimeRange({ start: line.time.start, end }), backgrounds: merged }
}

/**
 * A closed line cannot hold an open background, so it stops where the line does.
 * On the last line the timeline itself ends unknown, so an open background leaves the line open too.
 */
const boundOpenBackgrounds = (lines: runtime.Line[]) => {
  const last = lines.length - 1
  return lines.map((line, index) => {
    const open = line.backgrounds.filter((background) => {
      return background.time !== undefined && background.time.end === undefined
    })
    if (!open.length) {
      return line
    }
    if (index === last) {
      return line.time ? { ...line, time: makeTimeRange({ start: line.time.start }) } : line
    }
    if (!line.time || line.time.end === undefined) {
      return line
    }
    const end = line.time.end
    return {
      ...line,
      backgrounds: line.backgrounds.map((background) => {
        const time = background.time
        if (!time || time.end !== undefined) {
          return background
        }
        return { ...background, time: makeTimeRange({ start: time.start, end: Math.max(time.start, end) }) }
      }),
    }
  })
}

/**
 * Words are kept only where the caller says the lyric is word-timed, since the other timings forbid them.
 */
const makeBackground = (line: runtime.Line, words: runtime.Word[], text: string, time: runtime.TimeRange | undefined, wordLevel: boolean) => {
  return makeLineBackground({
    time,
    agents: [...line.agents],
    languages: [...line.languages],
    content: wordLevel && words.length ? makeLineContentWords(words) : makeLineContentText(text),
  })
}

const readBackgrounds = (line: runtime.Line, wordLevel: boolean) => {
  const content = line.content
  if (!content) {
    return []
  }

  const range = line.time
  if (wordLevel && content.words.length) {
    return splitWords(content.words).runs.map((words) => {
      const time = range ? readWordRange(words, range) : undefined
      return makeBackground(line, words, words.map((word) => word.text).join(''), time, wordLevel)
    })
  }

  const text = content.text ?? content.words.map((word) => word.text).join('')
  if (!text) {
    return []
  }
  const { runs, length } = splitText(text)
  return runs.map((run) => {
    return makeBackground(line, [], run.text, range ? mapSpan(range, length, run) : undefined, false)
  })
}

/**
 * An entry without brackets stays on the line, since only the bracketed part describes a background.
 * The line's annotation is rebuilt rather than edited, so the input lyric stays untouched.
 */
const splitAnnotation = (annotation: runtime.LineAnnotation | undefined, backgrounds: runtime.LineBackground[]) => {
  if (!annotation || !backgrounds.length) {
    return annotation
  }

  const move = <Item extends runtime.LineAnnotationRoman | runtime.LineAnnotationTranslation>(
    items: Item[],
    rebuild: (item: Item, text: string) => Item,
    push: (background: runtime.LineBackground, text: string, language: string | undefined) => void,
  ) => {
    return items.map((item) => {
      const { main, runs } = splitText(item.text)
      if (!runs.length) {
        return item
      }
      for (const [index, run] of runs.entries()) {
        const background = backgrounds[index]
        if (background) {
          push(background, run.text, item.language)
        }
      }
      return rebuild(item, main)
    })
  }

  const romans = move(
    annotation.romans,
    (item, text) => makeLineAnnotationRoman({ ...item, text }),
    (background, text, language) => {
      background.annotation ??= makeLineAnnotation()
      background.annotation.romans.push(makeLineAnnotationRoman({ text, language }))
    },
  )
  const translations = move(
    annotation.translations,
    (item, text) => makeLineAnnotationTranslation({ ...item, text }),
    (background, text, language) => {
      background.annotation ??= makeLineAnnotation()
      background.annotation.translations.push(makeLineAnnotationTranslation({ text, language }))
    },
  )
  return makeLineAnnotation({ ...annotation, romans, translations })
}

/**
 * Words survive only where the lyric is word-timed, since the other timings forbid them.
 */
const toBackground = (line: runtime.Line, time: runtime.TimeRange | undefined, wordLevel: boolean) => {
  const content = line.content
  if (!content) {
    return undefined
  }
  const text = content.text ?? content.words.map((word) => word.text).join('')
  if (!text) {
    return undefined
  }
  return makeLineBackground({
    time,
    agents: [...line.agents],
    languages: [...line.languages],
    content: wordLevel && content.words.length ? content : makeLineContentText(text),
    annotation: line.annotation,
  })
}

const isBracketOnlyLine = (line: runtime.Line | undefined) => {
  if (!line || line.type !== LineType.NORMAL) {
    return false
  }
  const { main, runs } = splitText(readLineText(line))
  return runs.length > 0 && !main
}

/**
 * A line that held nothing but brackets has no text of its own to sing, so it cannot be the one a background accompanies.
 */
const findParentIndex = (lines: runtime.Line[]) => {
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index]
    if (line?.type === LineType.NORMAL && !isBracketOnlyLine(line)) {
      return index
    }
  }
  return -1
}

/**
 * Both source lines go, since neither holds anything left to sing, and the joined range spans both.
 */
const joinCrossLine = (lines: runtime.Line[], wordLevel: boolean) => {
  const result: runtime.Line[] = []
  let changed = false
  let skip = false

  for (const [index, line] of lines.entries()) {
    if (skip) {
      skip = false
      continue
    }

    const next = lines[index + 1]
    const parentIndex = findParentIndex(result)
    if (line.type === LineType.NORMAL && next?.type === LineType.NORMAL && parentIndex !== -1) {
      const opened = splitText(readLineText(line))
      const closed = splitText(readLineText(next))
      const opens = opened.runs.length === 0 && isOpenBracket(opened.main.charAt(0))
      const closes = closed.runs.length === 0 && isCloseBracket(closed.main.charAt(closed.main.length - 1))
      if (opens && closes) {
        const start = line.time?.start
        const end = next.time?.end ?? next.time?.start
        const background = toBackground(
          { ...line, content: makeLineContentText(opened.main.slice(1) + closed.main.slice(0, -1)) },
          start === undefined ? undefined : makeTimeRange({ start, end }),
          wordLevel,
        )
        if (background) {
          result[parentIndex] = attach(result[parentIndex]!, [background])
          changed = true
          skip = true
          continue
        }
      }
    }
    result.push(line)
  }

  return { lines: result, changed }
}

const stripRuns = (content: runtime.LineContent): runtime.LineContent | undefined => {
  if (content.words.length) {
    const { main } = splitWords(content.words)
    return main.length ? makeLineContentWords(main) : undefined
  }
  const { main } = splitText(content.text ?? '')
  return main ? makeLineContentText(main) : undefined
}

/**
 * Pulls bracketed background vocals out of the sung lines and attaches them to the line they accompany.
 *
 * A line holding nothing but brackets becomes a background of the line before it and is removed.
 * A bracket opened on one line and closed on a later one joins the line before the opening, and both source lines go.
 * Text outside brackets stays on its line, and a line left with none keeps its place.
 *
 * @returns The input when unchanged, or a new lyric sharing all unchanged nodes.
 */
export const extractBackgroundLines = (lyric: runtime.Lyric, options: ExtractBackgroundLinesOptions = {}): runtime.Lyric => {
  const fullLine = options.fullLine ?? true
  const inLine = options.inLine ?? true
  const crossLine = options.crossLine ?? true
  if (!lyric.lines.length) {
    return lyric
  }

  const wordLevel = lyric.timing === Timing.WORD
  const joined = crossLine ? joinCrossLine(lyric.lines, wordLevel) : { lines: lyric.lines, changed: false }
  const result: runtime.Line[] = []
  let changed = joined.changed

  for (const line of joined.lines) {
    if (line.type !== LineType.NORMAL || !line.content) {
      result.push(line)
      continue
    }

    const parentIndex = findParentIndex(result)

    if (fullLine && parentIndex !== -1) {
      const { main, runs } = splitText(readLineText(line))
      if (runs.length && !main) {
        // Every run becomes a background of its own, so a line of two pairs keeps both.
        const backgrounds = runs.map((run) => {
          return makeBackground(line, [], run.text, readTimeRange(line), false)
        })
        result[parentIndex] = attach(result[parentIndex]!, backgrounds)
        changed = true
        continue
      }
    }

    const backgrounds = inLine ? readBackgrounds(line, wordLevel) : []
    if (!backgrounds.length) {
      result.push(line)
      continue
    }

    const nextContent = stripRuns(line.content)

    // A line left with nothing to sing only leaves when fullLine owns that case, so inLine keeps it here.
    if (!nextContent) {
      result.push(line)
      continue
    }

    const extracted: runtime.Line = {
      ...line,
      content: nextContent,
      annotation: splitAnnotation(line.annotation, backgrounds),
    }
    result.push(attach(extracted, backgrounds))
    changed = true
  }

  if (!changed) {
    return lyric
  }
  const lines = boundOpenBackgrounds(result)
  return { ...lyric, lines, languages: deriveLanguageUsages(lines) }
}
