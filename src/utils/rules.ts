import { findScriptRunEnd } from './language'

const RULE_WHITESPACE = /[\u0009-\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]/g
const RULE_EDGE_WHITESPACE =
  /^[\u0009-\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+|[\u0009-\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+$/g

/**
 * Uses the shared whitespace set and ASCII case folding to keep matching consistent across language kits.
 */
export const toRuleMatchKey = (text: string): string => {
  return text.replace(RULE_WHITESPACE, '').replace(/[A-Z]+/g, (run) => run.toLowerCase())
}

const RULE_WHITESPACE_CHARACTER = new RegExp(RULE_WHITESPACE.source)

/**
 * Finds the offsets in toRuleMatchKey(text) where the source allows a cut.
 * A cut sits before the first kept character of a script run and after configured whitespace, so neutral punctuation never splits aliases such as A&R or Co-Producer.
 *
 * @param text A source label with its original spelling.
 *
 * @returns Ascending offsets from 0 to the key length, or undefined when the source has no inner cut.
 */
export const findRuleMatchCuts = (text: string): readonly number[] | undefined => {
  // Most labels are a single script run without inner whitespace, so they skip the character walk.
  if (!RULE_WHITESPACE_CHARACTER.test(text) && findScriptRunEnd(text) === text.length) {
    return undefined
  }

  const cuts: number[] = [0]
  let length = 0
  let pendingCut = false
  let runStart = 0
  while (runStart < text.length) {
    const runEnd = findScriptRunEnd(text, runStart)
    if (runStart > 0) {
      pendingCut = true
    }
    for (const character of text.slice(runStart, runEnd)) {
      if (RULE_WHITESPACE_CHARACTER.test(character)) {
        pendingCut = true
        continue
      }
      if (pendingCut) {
        if (length > 0) {
          cuts.push(length)
        }
        pendingCut = false
      }
      length += character.length
    }
    runStart = runEnd
  }
  if (cuts.length === 1) {
    return undefined
  }
  cuts.push(length)
  return cuts
}

/**
 * Preserves internal whitespace so source labels and credited names retain their spelling.
 */
export const trimRuleWhitespace = (text: string): string => text.replace(RULE_EDGE_WHITESPACE, '')
