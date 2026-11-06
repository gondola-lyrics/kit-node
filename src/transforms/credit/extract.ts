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
   * Matches existing unknown metadata keys as credit labels and consumes fully readable matches.
   * Values use nameSeparators; unrecognized keys and values with no readable names remain unchanged.
   *
   * @default false
   */
  matchUnknowns?: boolean
  /**
   * Removes extracted source lines unless they carry background vocals, line annotations, or word translations or romanizations.
   * Ruby annotations alone do not prevent removal.
   *
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
    if (!entries) {
      entries = new Map()
      creditIndex.set(credit.raw, entries)
    }
    let entry = entries.get(credit.role)
    if (!entry) {
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
  if (!selected || selected === DEFAULT_CREDIT_NAME_SEPARATORS) {
    return DEFAULT_CREDIT_NAME_SEPARATORS
  }

  const useDefaultSeparators =
    selected.length === DEFAULT_CREDIT_NAME_SEPARATORS.length &&
    selected.every((separator, index) => separator === DEFAULT_CREDIT_NAME_SEPARATORS[index])
  if (useDefaultSeparators) {
    return DEFAULT_CREDIT_NAME_SEPARATORS
  }

  const separators = [...new Set(selected)].filter(Boolean).sort((first, second) => second.length - first.length)
  return separators
}

const readCreditNames = (text: string, separators: readonly string[]): string[] => {
  const hasSeparator = separators.some((separator) => text.includes(separator))
  if (!hasSeparator) {
    const name = trimRuleWhitespace(text)
    return name ? [name] : []
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
    if (trimmed) {
      unique.add(trimmed)
    }
  }
  return [...unique]
}

const canRemoveSourceLine = (line: runtime.Line): boolean => {
  if (line.backgrounds.length || line.annotation) {
    return false
  }

  // Credit extraction does not carry translations or romanizations into metadata.
  // Ruby alone must not keep extracted credits in the lyric stream.
  return !line.content?.words.some(({ annotation }) => {
    if (!annotation) {
      return false
    }
    return !!(annotation.translations.length || annotation.romans.length)
  })
}

const hasCreditColon = (word: runtime.Word): boolean => {
  return word.text.includes(':') || word.text.includes('：')
}

/**
 * Preserves source labels and name spelling while matching normalized credit labels in normal lead lines.
 * Merges names by role and original label without inferring their language.
 * Unknown metadata is processed only when matchUnknowns is enabled; consumed entries leave the unknown list.
 *
 * @returns The input when unchanged, or a new lyric sharing all unchanged nodes.
 */
export const extractCredits = (lyric: runtime.Lyric, options: ExtractCreditsOptions = {}): runtime.Lyric => {
  const separators = prepareCreditSeparators(options.nameSeparators)

  const originalCredits = lyric.meta?.credits ?? []
  let credits = originalCredits
  let creditIndex: CreditIndex | undefined

  const appendCredit = (raw: string, names: string[]): boolean => {
    const roles = matchCreditLabel(raw)
    if (!roles || !names.length) {
      return false
    }
    creditIndex ??= createCreditIndex(originalCredits)
    let entries = creditIndex.get(raw)
    if (!entries) {
      entries = new Map()
      creditIndex.set(raw, entries)
    }
    for (const role of roles) {
      let entry = entries.get(role)
      const additions = names.filter((name) => !entry?.names.has(name))
      if (!additions.length) {
        continue
      }
      if (credits === originalCredits) {
        credits = [...originalCredits]
      }
      const nameNodes = additions.map((name) => makeText({ text: name }))
      if (!entry) {
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
    return true
  }

  const originalUnknowns = lyric.meta?.unknowns ?? []
  let unknowns = originalUnknowns
  if (options.matchUnknowns) {
    for (const [index, entry] of originalUnknowns.entries()) {
      const raw = trimRuleWhitespace(entry.key)
      const names = matchCreditLabel(raw) ? readCreditNames(entry.value, separators) : []
      if (appendCredit(raw, names)) {
        if (unknowns === originalUnknowns) {
          unknowns = originalUnknowns.slice(0, index)
        }
      } else if (unknowns !== originalUnknowns) {
        unknowns.push(entry)
      }
    }
  }

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
    const names = matchCreditLabel(raw) ? readCreditNames(text.slice(colon + 1), separators) : []
    if (!appendCredit(raw, names)) {
      remainingLines?.push(line)
      continue
    }

    if (options.removeSourceLines && canRemoveSourceLine(line)) {
      remainingLines ??= originalLines.slice(0, index)
    } else {
      remainingLines?.push(line)
    }
  }

  if (credits === originalCredits && unknowns === originalUnknowns && !remainingLines) {
    return lyric
  }

  const removed = !!remainingLines
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

  const meta =
    credits === originalCredits && unknowns === originalUnknowns
      ? lyric.meta
      : lyric.meta
        ? { ...lyric.meta, credits, unknowns }
        : makeMeta({ credits, unknowns })
  return { ...lyric, meta, lines, timing, languages: removed ? deriveLanguageUsages(lines) : lyric.languages }
}
