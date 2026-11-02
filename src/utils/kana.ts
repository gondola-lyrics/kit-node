// Small kana keyed by code point, each listing the base kana it joins into one mora.
// Loanword pairs such as dyu, fyu, tyu and ye sit alongside the native rows.
const KANA_COMBINATIONS = new Map<number, string>([
  [0x3041, 'うくぐつふゔ'],
  [0x3043, 'うくぐすずつてでふゔ'],
  [0x3045, 'とど'],
  [0x3047, 'いうくぐしじちぢつにひびぴみりふゔ'],
  [0x3049, 'うくぐつふゔ'],
  [0x3083, 'きぎしじちぢにひびぴみり'],
  [0x3085, 'きぎしじちぢにひびぴみりてでふゔ'],
  [0x3087, 'きぎしじちぢにひびぴみり'],
  [0x308e, 'くぐ'],
])

const readKana = (text: string): string => {
  const kana = text.normalize('NFKC')
  if (kana.length !== 1) {
    return ''
  }
  const code = kana.charCodeAt(0)
  return code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : kana
}

/**
 * Reports whether the second kana joins the first into one mora, so a single roman fragment may cover both.
 *
 * Katakana and compatibility forms normalize to hiragana first.
 * Doubled consonants, long-vowel marks and three-kana runs are not combinations.
 */
export const combinesKana = (first: string, second: string): boolean => {
  const base = readKana(first)
  const small = readKana(second)
  return !!base && !!small && !!KANA_COMBINATIONS.get(small.charCodeAt(0))?.includes(base)
}
