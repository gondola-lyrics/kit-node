const enum ScriptGroup {
  NEUTRAL,
  EAST_ASIAN,
  LATIN,
  HANGUL,
  CYRILLIC,
  GREEK,
  ARABIC,
  HEBREW,
  DEVANAGARI,
  THAI,
}

const SCRIPT_PATTERNS: readonly (readonly [RegExp, ScriptGroup])[] = [
  [/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u, ScriptGroup.EAST_ASIAN],
  [/\p{Script=Latin}/u, ScriptGroup.LATIN],
  [/\p{Script=Hangul}/u, ScriptGroup.HANGUL],
  [/\p{Script=Cyrillic}/u, ScriptGroup.CYRILLIC],
  [/\p{Script=Greek}/u, ScriptGroup.GREEK],
  [/\p{Script=Arabic}/u, ScriptGroup.ARABIC],
  [/\p{Script=Hebrew}/u, ScriptGroup.HEBREW],
  [/\p{Script=Devanagari}/u, ScriptGroup.DEVANAGARI],
  [/\p{Script=Thai}/u, ScriptGroup.THAI],
]

const getOtherScript = (text: string, start: number, width: number): ScriptGroup => {
  const unit = text.charCodeAt(start)
  if (unit === 0x30fb || unit === 0x30fc) {
    return ScriptGroup.NEUTRAL
  }
  if ((unit >= 0x0400 && unit <= 0x0481) || (unit >= 0x048a && unit <= 0x052f)) {
    return ScriptGroup.CYRILLIC
  }
  if (unit >= 0x03a3 && unit <= 0x03e1) {
    return ScriptGroup.GREEK
  }
  if ((unit >= 0x0620 && unit <= 0x063f) || (unit >= 0x0641 && unit <= 0x064a)) {
    return ScriptGroup.ARABIC
  }
  if (unit >= 0x05d0 && unit <= 0x05ea) {
    return ScriptGroup.HEBREW
  }
  if ((unit >= 0x0900 && unit <= 0x0950) || (unit >= 0x0955 && unit <= 0x0963) || (unit >= 0x0966 && unit <= 0x097f)) {
    return ScriptGroup.DEVANAGARI
  }
  if ((unit >= 0x0e01 && unit <= 0x0e3a) || (unit >= 0x0e40 && unit <= 0x0e5b)) {
    return ScriptGroup.THAI
  }

  const character = text.slice(start, start + width)
  for (const [pattern, script] of SCRIPT_PATTERNS) {
    if (pattern.test(character)) {
      return script
    }
  }
  return ScriptGroup.NEUTRAL
}

/**
 * Finds a boundary between supported scripts without allocating a segment list.
 * Han and kana share a group so Japanese labels stay intact; Hangul, Latin, Cyrillic, Greek, Arabic, Hebrew, Devanagari and Thai remain separate.
 * Punctuation, digits, inherited marks and unsupported scripts stay in the surrounding run.
 *
 * @param start A UTF-16 offset at a code-point boundary, usually the end returned by the previous call.
 *
 * @returns The exclusive UTF-16 end of the run, or text.length when no later boundary exists.
 */
export const findScriptRunEnd = (text: string, start = 0): number => {
  let script = ScriptGroup.NEUTRAL
  let index = start

  while (index < text.length) {
    const unit = text.charCodeAt(index)
    let nextScript = ScriptGroup.NEUTRAL
    let width = 1

    if (unit <= 0x7f) {
      const letter = unit | 0x20
      if (letter >= 0x61 && letter <= 0x7a) {
        if (script !== ScriptGroup.NEUTRAL && script !== ScriptGroup.LATIN) {
          return index
        }
        script = ScriptGroup.LATIN
        do {
          index += 1
          const nextLetter = text.charCodeAt(index) | 0x20
          if (nextLetter < 0x61 || nextLetter > 0x7a) {
            break
          }
        } while (index < text.length)
        continue
      }
    } else if (unit >= 0x4e00 && unit <= 0x9fff) {
      nextScript = ScriptGroup.EAST_ASIAN
    } else if ((unit >= 0x3041 && unit <= 0x3096) || (unit >= 0x30a1 && unit <= 0x30fa)) {
      nextScript = ScriptGroup.EAST_ASIAN
    } else if (unit >= 0xac00 && unit <= 0xd7a3) {
      nextScript = ScriptGroup.HANGUL
    } else {
      width = unit >= 0xd800 && unit <= 0xdbff && text.codePointAt(index)! > 0xffff ? 2 : 1
      nextScript = getOtherScript(text, index, width)
    }

    if (nextScript !== ScriptGroup.NEUTRAL) {
      if (script !== ScriptGroup.NEUTRAL && script !== nextScript) {
        return index
      }
      script = nextScript
    }
    index += width
  }
  return text.length
}

/**
 * Returns a language tag in the canonical form the model stores, which is lower case.
 *
 * This mirrors the model's own helper, which it does not export.
 * Comparing tags stays with the consumer, since BCP 47 matches by subtag prefix rather than by string equality.
 */
export const lowerTag = (tag: string | undefined): string | undefined => {
  return tag ? tag.toLowerCase() : undefined
}
