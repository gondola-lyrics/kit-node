import enRules from '@rules/filters/en.json'
import zhHansRules from '@rules/filters/zh-hans.json'
import { toRuleMatchKey } from '@root/utils'

export interface NonLyricGroup {
  readonly category: string
  readonly whole: boolean
  readonly words: readonly string[]
}

const nonLyricGroups: readonly NonLyricGroup[] = [zhHansRules, enRules].flatMap((ruleSet) => {
  return ruleSet.groups.map((group) => {
    if (group.match !== 'contains' && group.match !== 'whole') {
      throw new TypeError('Unsupported filter match: ' + group.match)
    }
    return { category: group.category, whole: group.match === 'whole', words: group.words.map(toRuleMatchKey) }
  })
})

/**
 * Categories the bundled filter rules identify, in rule order.
 */
export const NON_LYRIC_CATEGORIES: readonly string[] = [...new Set(nonLyricGroups.map((group) => group.category))]

/**
 * Keeps rule order so earlier groups still take precedence within a selection; undefined selects every group.
 */
export const selectNonLyricGroups = (categories: readonly string[] | undefined): readonly NonLyricGroup[] => {
  if (categories === undefined) {
    return nonLyricGroups
  }
  return nonLyricGroups.filter((group) => categories.includes(group.category))
}

/**
 * Returns the category of the first group that identifies the normalized text.
 * whole needs the complete text to equal a word, while contains accepts a word anywhere because the rules carry no word boundaries.
 */
export const matchNonLyricCategory = (text: string, groups: readonly NonLyricGroup[]): string | undefined => {
  const key = toRuleMatchKey(text)
  if (key === '') {
    return undefined
  }
  for (const group of groups) {
    const matched = group.whole ? group.words.includes(key) : group.words.some((word) => key.includes(word))
    if (matched) {
      return group.category
    }
  }
  return undefined
}
