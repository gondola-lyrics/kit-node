import { CreditRole } from '@gondola-lyrics/model/runtime'

import enRules from '@rules/credits/en.json'
import zhHansRules from '@rules/credits/zh-hans.json'
import { findRuleMatchCuts, toRuleMatchKey } from '@root/utils'

const MATCH_CACHE_LIMIT = 256
const MAX_CACHED_LABEL_LENGTH = 256

const CREDIT_ROLES = new Map<string, CreditRole>([
  ['OTHER', CreditRole.OTHER],
  ['LYRICIST', CreditRole.LYRICIST],
  ['COMPOSER', CreditRole.COMPOSER],
  ['ARRANGER', CreditRole.ARRANGER],
  ['PRODUCER', CreditRole.PRODUCER],
  ['PERFORMER', CreditRole.PERFORMER],
  ['MIXER', CreditRole.MIXER],
  ['MASTERING', CreditRole.MASTERING],
])

const creditRules = new Map<string, readonly CreditRole[]>()
const matchCache = new Map<string, readonly CreditRole[] | null>()

for (const ruleSet of [zhHansRules, enRules]) {
  for (const group of ruleSet.groups) {
    const roles = group.roles.map((name) => {
      const role = CREDIT_ROLES.get(name)
      if (role === undefined) {
        throw new TypeError('Unsupported credit role: ' + name)
      }
      return role
    })

    for (const word of group.words) {
      const key = toRuleMatchKey(word)
      if (!creditRules.has(key)) {
        creditRules.set(key, roles)
      }
    }
  }
}

const haveSameRoles = (first: readonly CreditRole[], second: readonly CreditRole[]): boolean => {
  if (first === second) {
    return true
  }
  if (first.length !== second.length) {
    return false
  }
  if (first.length === 1) {
    return first[0] === second[0]
  }
  return first.every((role) => second.includes(role))
}

const findCoveringRoles = (label: string, key: string): readonly CreditRole[] | undefined => {
  // Cuts come from the source label because the key no longer carries its whitespace.
  const cuts = findRuleMatchCuts(label)
  if (cuts === undefined) {
    return undefined
  }

  const last = cuts.length - 1
  let bestCount = last + 1
  let bestRoles: readonly CreditRole[] | undefined
  // Parts are tried longest first so the fewest-part covering appears early; false means two equally short coverings disagree.
  const search = (from: number, count: number, roles: readonly CreditRole[] | undefined): boolean => {
    if (from === last) {
      if (count < bestCount) {
        bestCount = count
        bestRoles = roles
        return true
      }
      return count > bestCount || haveSameRoles(roles!, bestRoles!)
    }
    if (count + 1 > bestCount) {
      return true
    }
    for (let to = last; to > from; to -= 1) {
      const matched = creditRules.get(key.slice(cuts[from]!, cuts[to]!))
      if (matched === undefined || (roles !== undefined && !haveSameRoles(roles, matched))) {
        continue
      }
      if (!search(to, count + 1, roles ?? matched)) {
        return false
      }
    }
    return true
  }
  return search(0, 0, undefined) ? bestRoles : undefined
}

/**
 * Prefers the complete alias, then accepts adjacent parts that each resolve to the same roles.
 * Parts are cut only where the source has whitespace or a script boundary, and the covering with the fewest parts wins.
 * Unknown parts, role conflicts, and equally short coverings that disagree stay unmatched so the source remains available to later processing.
 */
export const matchCreditLabel = (label: string): readonly CreditRole[] | undefined => {
  const cached = matchCache.get(label)
  if (cached !== undefined) {
    return cached ?? undefined
  }

  const key = toRuleMatchKey(label)
  const roles = creditRules.get(key) ?? findCoveringRoles(label, key)

  // Cache source spellings to avoid renormalizing recurring headers without retaining arbitrarily long labels.
  if (label.length <= MAX_CACHED_LABEL_LENGTH) {
    if (matchCache.size === MATCH_CACHE_LIMIT) {
      const oldest = matchCache.keys().next().value
      if (oldest !== undefined) {
        matchCache.delete(oldest)
      }
    }
    matchCache.set(label, roles ?? null)
  }
  return roles
}
