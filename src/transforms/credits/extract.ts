import type { runtime } from '@gondola-lyrics/model'

import {
  LineType,
  Timing,
  deriveLanguageUsages,
  getContentText,
  isWordLevelLine,
  makeMeta,
  makeMetaCredit,
  makeText,
} from '@gondola-lyrics/model/runtime'

import { trimRuleWhitespace } from '@root/utils'

import { matchCreditLabel } from './rules'

export const DEFAULT_CREDIT_NAME_SEPARATORS = ['+', '：', '/'] as const

export interface ExtractCreditsOptions {
  /**
   * Removes extracted source lines only when they carry no background vocals or line/word annotations.
   * Refreshes language usages and falls back to line timing when no word-level content remains.
   *
   * @default false
   */
  removeSourceLines?: boolean
  /**
   * Splits names at literal separators and ignores empty strings; an empty list preserves the complete source name.
   * Longer separators take precedence so overlapping delimiters remain predictable.
   *
   * @default DEFAULT_CREDIT_NAME_SEPARATORS
   */
  nameSeparators?: readonly string[]
}

interface CreditEntry {
  index: number
  names: Set<string>
}

type CreditIndex = Map<runtime.MetaCredit['raw'], Map<runtime.MetaCredit['role'], CreditEntry>>

const createCreditIndex = (credits: readonly runtime.MetaCredit[]): CreditIndex => {
  const creditIndex: CreditIndex = new Map()
  for (let index = 0; index < credits.length; index += 1) {
    const credit = credits[index]!
    let entries = creditIndex.get(credit.raw)
    if (entries === undefined) {
      entries = new Map()
      creditIndex.set(credit.raw, entries)
    }
    let entry = entries.get(credit.role)
    if (entry === undefined) {
      entry = { index, names: new Set() }
      entries.set(credit.role, entry)
    }
    for (const name of credit.names) {
      entry.names.add(name.text)
    }
  }
  return creditIndex
}

const prepareCreditSeparators = (selected: readonly string[] | undefined): readonly string[] => {
  if (selected === undefined || selected === DEFAULT_CREDIT_NAME_SEPARATORS) {
    return DEFAULT_CREDIT_NAME_SEPARATORS
  }

  const useDefaultSeparators =
    selected.length === DEFAULT_CREDIT_NAME_SEPARATORS.length &&
    selected.every((separator, index) => separator === DEFAULT_CREDIT_NAME_SEPARATORS[index])
  if (useDefaultSeparators) {
    return DEFAULT_CREDIT_NAME_SEPARATORS
  }

  const separators = [...new Set(selected)].filter((separator) => separator !== '').sort((first, second) => second.length - first.length)
  return separators
}

const readCreditNames = (text: string, separators: readonly string[]): string[] => {
  const hasSeparator = separators.some((separator) => text.includes(separator))
  if (!hasSeparator) {
    const name = trimRuleWhitespace(text)
    return name === '' ? [] : [name]
  }

  let names = [text]
  for (const separator of separators) {
    const hasNameSeparator = names.some((name) => name.includes(separator))
    if (hasNameSeparator) {
      names = names.flatMap((name) => name.split(separator))
    }
  }

  const unique = new Set<string>()
  for (const name of names) {
    const trimmed = trimRuleWhitespace(name)
    if (trimmed !== '') {
      unique.add(trimmed)
    }
  }
  return [...unique]
}

const canRemoveSourceLine = (line: runtime.Line): boolean => {
  if (line.backgrounds.length > 0 || line.annotation !== undefined) {
    return false
  }

  const hasWordAnnotation = line.content?.words.some((word) => word.annotation !== undefined) ?? false
  return !hasWordAnnotation
}

const hasCreditColon = (word: runtime.Word): boolean => {
  return word.text.includes(':') || word.text.includes('：')
}

/**
 * Preserves source labels and name spelling while matching normalized credit labels in normal lead lines.
 * Merges names by role and original label without inferring their language.
 *
 * @returns The input when unchanged, or a new lyric sharing all unchanged nodes.
 */
export const extractCredits = (lyric: runtime.Lyric, options: ExtractCreditsOptions = {}): runtime.Lyric => {
  const separators = prepareCreditSeparators(options.nameSeparators)

  const originalCredits = lyric.meta?.credits ?? []
  let credits = originalCredits
  let creditIndex: CreditIndex | undefined

  const originalLines = lyric.lines
  let remainingLines: runtime.Line[] | undefined
  for (let index = 0; index < originalLines.length; index += 1) {
    const line = originalLines[index]!
    if (line.type !== LineType.NORMAL) {
      remainingLines?.push(line)
      continue
    }

    const content = line.content
    // Avoid joining word-timed lyric content when no word can contain a credit delimiter.
    const hasCandidateContent = content?.text !== undefined || (content?.words.some(hasCreditColon) ?? false)
    if (!hasCandidateContent) {
      remainingLines?.push(line)
      continue
    }
    const text = getContentText(content)
    const colon = text.search(/[:：]/)
    if (colon === -1) {
      remainingLines?.push(line)
      continue
    }
    const raw = trimRuleWhitespace(text.slice(0, colon))
    const roles = matchCreditLabel(raw)
    const names = roles === undefined ? [] : readCreditNames(text.slice(colon + 1), separators)
    if (roles === undefined || names.length === 0) {
      remainingLines?.push(line)
      continue
    }

    creditIndex ??= createCreditIndex(originalCredits)
    let entries = creditIndex.get(raw)
    if (entries === undefined) {
      entries = new Map()
      creditIndex.set(raw, entries)
    }
    for (const role of roles) {
      let entry = entries.get(role)
      const additions = names.filter((name) => !entry?.names.has(name))
      if (additions.length === 0) {
        continue
      }
      if (credits === originalCredits) {
        credits = [...originalCredits]
      }
      const nameNodes = additions.map((name) => makeText({ text: name }))
      if (entry === undefined) {
        entry = { index: credits.length, names: new Set() }
        entries.set(role, entry)
        credits.push(makeMetaCredit({ role, raw, names: nameNodes }))
      } else {
        const credit = credits[entry.index]!
        credits[entry.index] = { ...credit, names: [...credit.names, ...nameNodes] }
      }
      for (const name of additions) {
        entry.names.add(name)
      }
    }

    if (options.removeSourceLines === true && canRemoveSourceLine(line)) {
      remainingLines ??= originalLines.slice(0, index)
    } else {
      remainingLines?.push(line)
    }
  }

  if (credits === originalCredits && remainingLines === undefined) {
    return lyric
  }

  const removed = remainingLines !== undefined
  const lines = remainingLines ?? originalLines

  let timing = lyric.timing
  if (removed && timing === Timing.WORD) {
    const hasWordLevelContent = lines.some((line) => {
      return isWordLevelLine(line) || line.backgrounds.some(isWordLevelLine)
    })
    if (!hasWordLevelContent) {
      timing = Timing.LINE
    }
  }

  const meta = credits === originalCredits ? lyric.meta : lyric.meta === undefined ? makeMeta({ credits }) : { ...lyric.meta, credits }
  return { ...lyric, meta, lines, timing, languages: removed ? deriveLanguageUsages(lines) : lyric.languages }
}
