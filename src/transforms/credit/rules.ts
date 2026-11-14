import { CreditRole } from '@gondola-lyrics/model'

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
  ['MIXER', CreditRole.MIXING_ENGINEER],
  ['MASTERING', CreditRole.MASTERING_ENGINEER],
])

interface CreditRule {
  roles: readonly CreditRole[]
  roleKey: string
}

interface CreditCovering {
  roles: readonly CreditRole[]
  count: number
}

const creditRules = new Map<string, CreditRule>()
const matchCache = new Map<string, readonly CreditRole[] | null>()
let maxRuleLength = 0

for (const ruleSet of [zhHansRules, enRules]) {
  for (const group of ruleSet.groups) {
    const roles = group.roles.map((name) => {
      const role = CREDIT_ROLES.get(name) ?? null
      if (role === null) {
        throw new TypeError('Unsupported credit role: ' + name)
      }
      return role
    })
    const rule: CreditRule = { roles, roleKey: [...roles].sort((first, second) => first - second).join(',') }

    for (const word of group.words) {
      const key = toRuleMatchKey(word)
      if (!creditRules.has(key)) {
        creditRules.set(key, rule)
        maxRuleLength = Math.max(maxRuleLength, key.length)
      }
    }
  }
}

const findCoveringRoles = (label: string, key: string): readonly CreditRole[] | null => {
  // Cuts come from the source label because the key no longer carries its whitespace.
  const cuts = findRuleMatchCuts(label) ?? null
  if (!cuts) {
    return null
  }

  const last = cuts.length - 1
  const coverings = Array.from({ length: cuts.length }, () => new Map<string, CreditCovering>())
  for (let from = last - 1; from >= 0; from -= 1) {
    const current = coverings[from]!
    for (let to = from + 1; to <= last; to += 1) {
      if (cuts[to]! - cuts[from]! > maxRuleLength) {
        break
      }
      const matched = creditRules.get(key.slice(cuts[from]!, cuts[to]!)) ?? null
      if (!matched) {
        continue
      }
      const suffixCount = to === last ? 0 : (coverings[to]!.get(matched.roleKey)?.count ?? null)
      if (suffixCount === null) {
        continue
      }
      const count = suffixCount + 1
      const previous = current.get(matched.roleKey) ?? null
      // Equal counts retain the longer prefix's original role order without sorting the returned roles.
      if (!previous || count <= previous.count) {
        current.set(matched.roleKey, { roles: matched.roles, count })
      }
    }
  }

  let bestCount = Infinity
  let bestRoles: readonly CreditRole[] | null = null
  for (const covering of coverings[0]!.values()) {
    if (covering.count < bestCount) {
      bestCount = covering.count
      bestRoles = covering.roles
    } else if (covering.count === bestCount) {
      bestRoles = null
    }
  }
  return bestRoles
}

/**
 * Prefers the complete alias, then accepts adjacent parts that each resolve to the same roles.
 * Parts are cut only where the source has whitespace or a script boundary, and the covering with the fewest parts wins.
 * Unknown parts, role conflicts, and equally short coverings that disagree stay unmatched so the source remains available to later processing.
 *
 * @returns The selected roles in source order, or null when no unambiguous complete match exists.
 */
export const matchCreditLabel = (label: string): readonly CreditRole[] | null => {
  if (matchCache.has(label)) {
    return matchCache.get(label) ?? null
  }

  const key = toRuleMatchKey(label)
  const roles = creditRules.get(key)?.roles ?? findCoveringRoles(label, key)

  // Cache source spellings to avoid renormalizing recurring headers without retaining arbitrarily long labels.
  if (label.length <= MAX_CACHED_LABEL_LENGTH) {
    if (matchCache.size === MATCH_CACHE_LIMIT) {
      const oldest = matchCache.keys().next().value ?? null
      if (oldest !== null) {
        matchCache.delete(oldest)
      }
    }
    matchCache.set(label, roles)
  }
  return roles
}
