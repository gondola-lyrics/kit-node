import type { Agent, EnrichedLine, EnrichedLineContent, EnrichedLyric, EnrichedWord } from '@gondola-lyrics/model'

import {
  AgentType,
  EnrichedLineType,
  TimingLevel,
  deriveEnrichedLanguageUsages,
  getEnrichedLineContentText,
  hasEnrichedLineWords,
  makeAgent,
  makeEnrichedLineContentText,
  makeEnrichedLineContentWords,
  makeText,
} from '@gondola-lyrics/model'

export interface ExtractAgentsOptions {
  /**
   * Maps complete, trimmed prefixes to existing agent ids, preserving array order for joint performers.
   * Matching is case-sensitive and preserves internal whitespace; an empty object disables automatic inference.
   * Omitting this option enables legacy name inference; explicit bindings override its clock exclusion.
   */
  bindings?: Readonly<Record<string, string | readonly string[]>>
  /**
   * Removes matched prefixes and drops lines left with no sung text, including their attached content.
   *
   * @default true
   */
  removePrefixes?: boolean
}

const hashName = (name: string): string => {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = ((hash << 5) - hash + name.charCodeAt(index)) | 0
  }
  return (hash >>> 0).toString(16).padStart(8, '0').toUpperCase()
}

const haveSameAgents = (first: readonly string[], second: readonly string[]): boolean => {
  return first.length === second.length && first.every((id, index) => id === second[index])
}

const prepareBindings = (bindings: ExtractAgentsOptions['bindings'], agents: readonly Agent[]): Map<string, readonly string[]> | undefined => {
  if (!bindings) {
    return undefined
  }
  const knownIds = new Set(agents.map((agent) => agent.id))
  return new Map(
    Object.entries(bindings).map(([prefix, target]) => {
      const ids = [...new Set(typeof target === 'string' ? [target] : target)]
      const missingId = ids.find((id) => !knownIds.has(id))
      if (missingId !== undefined) {
        throw new TypeError(`binding for ${JSON.stringify(prefix)} references unknown agent id ${JSON.stringify(missingId)}`)
      }
      return [prefix.trim(), ids] as const
    }),
  )
}

/**
 * Retains the legacy clock exclusion, including its accepted hour and minute bounds.
 */
const isClockTimeColon = (before: string, after: string): boolean => {
  const hour = /(\d+)$/.exec(before)?.[1]
  const minute = /^(\d+)/.exec(after)?.[1]
  if (!hour || !minute) {
    return false
  }
  return hour.length <= 2 && Number(hour) <= 24 && minute.length <= 2 && Number(minute) <= 60
}

/**
 * Cuts only source text, so retained word ranges and annotations do not need fabricated character timings.
 */
const removePrefix = (content: EnrichedLineContent | undefined, length: number): EnrichedLineContent | undefined => {
  if (!content) {
    return undefined
  }
  if (content.text !== undefined) {
    const text = content.text.slice(length).trim()
    return text ? makeEnrichedLineContentText(text) : undefined
  }

  const words: EnrichedWord[] = []
  let remaining = length
  for (const word of content.words) {
    if (remaining >= word.text.length) {
      remaining -= word.text.length
      continue
    }
    if (remaining > 0) {
      const text = word.text.slice(remaining).trim()
      remaining = 0
      if (text) {
        words.push({ ...word, text })
      }
    } else {
      words.push(word)
    }
  }
  const hasText = words.some((word) => !!word.text.trim())
  return hasText ? makeEnrichedLineContentWords(words) : undefined
}

/**
 * Extracts colon-prefixed performers and carries them across nonempty normal lines, replacing their existing agent lists.
 * Missing bindings enables legacy name inference; supplied bindings accept exact prefixes and reset propagation on unmatched prefixes.
 * Removing prefixes preserves retained line and word times, but drops prefix-only lines with their attached content.
 *
 * @returns The input when unchanged, or a new lyric sharing all unchanged nodes.
 *
 * @throws {TypeError} If bindings reference an agent id absent from lyric.agents.
 */
export const extractAgents = (lyric: EnrichedLyric, options: ExtractAgentsOptions = {}): EnrichedLyric => {
  const bindings = prepareBindings(options.bindings, lyric.agents)
  if (bindings?.size === 0 || !lyric.lines.length) {
    return lyric
  }

  const removePrefixes = options.removePrefixes ?? true
  const usedIds = new Set(lyric.agents.map((agent) => agent.id))
  const names = new Map<string, string | null>()
  for (const agent of lyric.agents) {
    if (!agent.id) {
      continue
    }
    for (const item of agent.names) {
      const name = item.text.trim()
      if (!name) {
        continue
      }
      if (!names.has(name)) {
        names.set(name, agent.id)
      } else if (names.get(name) !== agent.id) {
        names.set(name, null)
      }
    }
  }

  let agents = lyric.agents
  const resolveName = (name: string): readonly string[] => {
    const existing = names.get(name)
    if (existing) {
      return [existing]
    }
    const base = hashName(name)
    let id = base
    for (let suffix = 1; usedIds.has(id); suffix += 1) {
      id = `${base}-${suffix}`
    }
    const agent = makeAgent({ id, type: AgentType.PERSON, names: [makeText({ text: name })] })
    if (agents === lyric.agents) {
      agents = [...agents]
    }
    agents.push(agent)
    usedIds.add(id)
    names.set(name, id)
    return [id]
  }

  const originalLines = lyric.lines
  let lines: EnrichedLine[] | undefined
  let current: readonly string[] | undefined
  let contentChanged = false
  for (const [index, line] of originalLines.entries()) {
    const text = line.type === EnrichedLineType.NORMAL ? getEnrichedLineContentText(line.content) : ''
    if (line.type !== EnrichedLineType.NORMAL || !text.trim()) {
      current = undefined
      lines?.push(line)
      continue
    }

    const colon = text.search(/[:：]/u)
    let matched = false
    if (colon !== -1) {
      const name = text.slice(0, colon).trim()
      if (bindings) {
        const target = bindings.get(name)
        if (!target) {
          current = undefined
          lines?.push(line)
          continue
        }
        current = target
        matched = true
      } else if (!isClockTimeColon(text.slice(0, colon), text.slice(colon + 1))) {
        if (!name) {
          current = undefined
          lines?.push(line)
          continue
        }
        current = resolveName(name)
        matched = true
      }
    }

    let content = line.content
    if (matched && removePrefixes) {
      content = removePrefix(content, colon + 1)
      contentChanged = true
      if (!content) {
        lines ??= originalLines.slice(0, index)
        continue
      }
    }

    const nextAgents = current && !haveSameAgents(line.agentIds, current) ? [...current] : line.agentIds
    if (content !== line.content || nextAgents !== line.agentIds) {
      lines ??= originalLines.slice(0, index)
      lines.push({ ...line, content, agentIds: nextAgents })
    } else {
      lines?.push(line)
    }
  }

  if (!lines && agents === lyric.agents) {
    return lyric
  }

  const remainingLines = lines ?? originalLines
  let timing = lyric.timing
  if (contentChanged && timing === TimingLevel.WORD) {
    const hasWordLevelContent = remainingLines.some((line) => {
      return hasEnrichedLineWords(line) || line.backgrounds.some(hasEnrichedLineWords)
    })
    if (!hasWordLevelContent) {
      timing = TimingLevel.LINE
    }
  }
  return {
    ...lyric,
    agents,
    lines: remainingLines,
    timing,
    languageUsages: contentChanged ? deriveEnrichedLanguageUsages(remainingLines) : lyric.languageUsages,
  }
}
