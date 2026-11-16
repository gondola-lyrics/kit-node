import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  EnrichedWordType,
  makeEnrichedLineAnnotation,
  makeEnrichedLineAnnotationRoman,
  makeEnrichedLineAnnotationRomanContentTokens,
  makeEnrichedLineAnnotationTranslation,
  makeEnrichedLineBackground,
  makeEnrichedLineContentText,
  makeTextToken,
} from '@gondola-lyrics/model'

import { insertSpacesInLines, parseLrc, parseTtml } from '@root/parser'

const samples = [
  {
    timestamp: '01:21.791',
    start: 81791,
    duration: 2592,
    text: 'Swam around the oar',
    translation: '绕着船桨游荡',
    lrc: '[01:21.791]<0,768>Swam <768,384>around <1152,497>the <1649,943>oar',
  },
  {
    timestamp: '01:24.927',
    start: 84927,
    duration: 2752,
    text: 'Then we had to stop',
    translation: '我们只能停下来',
    lrc: '[01:24.927]<0,290>Then <290,350>we <640,576>had <1216,880>to <2096,656>stop',
  },
  {
    timestamp: '01:31.679',
    start: 91679,
    duration: 5520,
    text: 'Was it yesterday was it last year',
    translation: '是昨天 还是去年',
    lrc: '[01:31.679]<0,320>Was <320,400>it <720,2464>yesterday <3184,449>was <3633,399>it <4032,624>last <4656,864>year',
  },
]

test('space insertion with no rules preserves padded corpus lyrics, translations, and backgrounds', () => {
  const first = samples[0]!
  const second = samples[1]!
  const source =
    `<tt xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><body><p begin="${first.start}ms" end="${first.start + first.duration}ms" xml:space="preserve">  ${first.text}  ` +
    `<span ttm:role="x-translation">  ${first.translation}  </span><span ttm:role="x-roman">  ${first.text}  </span>` +
    `<span ttm:role="x-bg">  ${second.translation}  </span></p></body></tt>`
  const { lyric } = parseTtml(source)
  const original = structuredClone(lyric)
  assert.equal(insertSpacesInLines(lyric, { rules: [] }), lyric)
  assert.deepEqual(lyric, original)
})

test('space insertion fixes missing CJK boundaries while preserving corpus apostrophes', () => {
  const first = samples[0]!
  const second = samples[2]!
  const source = `[${first.timestamp}]${first.translation}${first.text}\n[${second.timestamp}]${second.text}`
  const { lyric } = parseLrc(source)
  const result = insertSpacesInLines(lyric)
  assert.equal(result.lines[0]?.content?.text, `${first.translation} ${first.text}`)
  assert.equal(result.lines[1], lyric.lines[1])
  assert.equal(result.lines[1]?.content?.text, second.text)
  assert.equal(insertSpacesInLines(result), result)
  const apostrophes = parseLrc("[01:37.858]It's so surreal when salty air was blowing\n[02:31.022]Grandpa's holding me").lyric
  assert.equal(insertSpacesInLines(apostrophes), apostrophes)
})

test('space insertion retains corpus word annotations and token timing when adding separators', () => {
  const first = samples[0]!
  const second = samples[1]!
  const { lyric } = parseLrc({
    original: `[${first.timestamp}]<0,768>${first.translation}<768,384>Swam`,
    romans: `[${first.timestamp}]<0,768>Swam<768,384>around`,
  })
  const line = lyric.lines[0]
  assert.ok(line)
  const words = line.content?.words
  assert.ok(words)
  assert.ok(words[0]?.annotation)
  const tokens = [
    makeTextToken({ text: first.translation, time: { start: 81791, end: 82559 }, extra: { source: 'first' } }),
    makeTextToken({ text: 'Swam', time: { start: 82559, end: 82943 }, extra: { source: 'second' } }),
  ]
  line.annotation = makeEnrichedLineAnnotation({
    romans: [makeEnrichedLineAnnotationRoman({ language: 'en', content: makeEnrichedLineAnnotationRomanContentTokens(tokens) })],
    translations: [makeEnrichedLineAnnotationTranslation({ text: second.translation + second.text })],
  })
  line.backgrounds = [
    makeEnrichedLineBackground({
      time: line.time,
      content: makeEnrichedLineContentText(second.translation + second.text),
      annotation: makeEnrichedLineAnnotation({ translations: [makeEnrichedLineAnnotationTranslation({ text: first.translation + first.text })] }),
    }),
  ]
  const original = structuredClone(lyric)
  const result = insertSpacesInLines(lyric)
  const rewritten = result.lines[0]
  assert.ok(rewritten)
  assert.deepEqual(
    rewritten.content?.words.map((word) => word.text),
    [first.translation, ' ', 'Swam'],
  )
  assert.equal(rewritten.content?.words[0], words[0])
  assert.equal(rewritten.content?.words[1]?.type, EnrichedWordType.SPACE)
  assert.equal(rewritten.content?.words[1]?.time, undefined)
  assert.equal(rewritten.content?.words[2], words[1])
  const rewrittenTokens = rewritten.annotation?.romans[0]?.content?.tokens
  assert.ok(rewrittenTokens)
  assert.deepEqual(
    rewrittenTokens.map((token) => token.text),
    [first.translation, ' ', 'Swam'],
  )
  assert.equal(rewrittenTokens[0], tokens[0])
  assert.equal(rewrittenTokens[2], tokens[1])
  assert.equal(rewrittenTokens[1]?.time, undefined)
  assert.equal(rewritten.annotation?.translations[0]?.text, second.translation + ' ' + second.text)
  assert.equal(rewritten.backgrounds[0]?.content?.text, second.translation + ' ' + second.text)
  const contentOnly = insertSpacesInLines(lyric, { annotations: false }).lines[0]
  assert.equal(contentOnly?.annotation, line.annotation)
  assert.equal(contentOnly?.backgrounds[0]?.annotation, line.backgrounds[0]?.annotation)
  assert.deepEqual(lyric, original)
})
