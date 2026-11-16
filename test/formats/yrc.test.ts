import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EnrichedWordType, TimingLevel, getEnrichedLineContentText } from '@gondola-lyrics/model'

import { detectFormat, parseYrc } from '@root/parser'

const samples = [
  {
    timestamp: '00:42.526',
    start: 42526,
    duration: 5480,
    text: 'In my heart the lightness secretly strikes a chord',
    translation: '这轻松的感觉 在我看来像悄然奏响的和弦',
    line: '[00:42.526]In my heart the lightness secretly strikes a chord',
    yrc: '[42526,5480](42526,208,99)In (42734,351,99)my (43085,369,99)heart (43454,400,99)the (43854,1392,99)lightness (45246,1088,99)secretly (46334,400,99)strikes (46734,416,99)a (47150,856,99)chord',
    words: [
      { type: EnrichedWordType.NORMAL, text: 'In', time: { start: 42526, end: 42734 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'my', time: { start: 42734, end: 43085 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'heart', time: { start: 43085, end: 43454 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'the', time: { start: 43454, end: 43854 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'lightness', time: { start: 43854, end: 45246 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'secretly', time: { start: 45246, end: 46334 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'strikes', time: { start: 46334, end: 46734 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'a', time: { start: 46734, end: 47150 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'chord', time: { start: 47150, end: 48006 } },
    ],
  },
  {
    timestamp: '01:57.130',
    start: 117130,
    duration: 3729,
    text: 'To the beating heart of the sky',
    translation: '奔向蓝天的怀抱',
    line: '[01:57.130]To the beating heart of the sky',
    yrc: '[117130,3729](117130,368,99)To (117498,304,99)the (117802,896,99)beating (118698,432,99)heart (119130,401,99)of (119531,639,99)the (120170,689,99)sky',
    words: [
      { type: EnrichedWordType.NORMAL, text: 'To', time: { start: 117130, end: 117498 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'the', time: { start: 117498, end: 117802 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'beating', time: { start: 117802, end: 118698 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'heart', time: { start: 118698, end: 119130 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'of', time: { start: 119130, end: 119531 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'the', time: { start: 119531, end: 120170 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'sky', time: { start: 120170, end: 120859 } },
    ],
  },
  {
    timestamp: '02:04.476',
    start: 124476,
    duration: 6016,
    text: "Let's go present her a bunch of daisy",
    translation: '我们给她献一捧雏菊吧',
    line: "[02:04.476]Let's go present her a bunch of daisy",
    yrc: "[124476,6016](124476,369,99)Let's (124845,415,99)go (125260,897,99)present (126157,1151,99)her (127308,352,99)a (127660,976,99)bunch (128636,464,99)of (129100,1392,99)daisy",
    words: [
      { type: EnrichedWordType.NORMAL, text: "Let's", time: { start: 124476, end: 124845 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'go', time: { start: 124845, end: 125260 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'present', time: { start: 125260, end: 126157 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'her', time: { start: 126157, end: 127308 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'a', time: { start: 127308, end: 127660 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'bunch', time: { start: 127660, end: 128636 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'of', time: { start: 128636, end: 129100 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'daisy', time: { start: 129100, end: 130492 } },
    ],
  },
]

test('YRC reads corpus absolute word starts, whitespace, and explicit durations', () => {
  const { lyric, diagnostics } = parseYrc(samples.map((sample) => sample.yrc).join('\n'))
  for (const [index, sample] of samples.entries()) {
    assert.deepEqual(lyric.lines[index]?.time, { start: sample.start, end: sample.start + sample.duration })
    assert.deepEqual(
      lyric.lines[index]?.content?.words.map(({ type, text, time }) => ({ type, text, time })),
      sample.words,
    )
  }
  assert.deepEqual(diagnostics, [])
})

test('YRC keeps corpus words at explicitly zero-duration bounds', () => {
  const sample = samples[1]!
  const { lyric, diagnostics } = parseYrc(`[${sample.start},0](${sample.start},0,99)${sample.text}`)
  assert.equal(lyric.timing, TimingLevel.WORD)
  assert.deepEqual(lyric.lines[0]?.time, { start: sample.start, end: sample.start })
  const words = lyric.lines[0]?.content?.words.filter((word) => word.type === EnrichedWordType.NORMAL)
  assert.ok(words)
  assert.ok(
    words.every((word) => {
      return word.time?.start === sample.start && word.time.end === sample.start
    }),
  )
  assert.deepEqual(diagnostics, [])
})

test('YRC treats corpus JSON display text literally and retains damaged JSON', () => {
  const first = samples[0]!
  const second = samples[1]!
  const literal = `${first.text} [${first.timestamp}] <${first.translation}>`
  const damaged = JSON.stringify({ t: second.start, c: [{ tx: second.translation }] }).slice(0, -1)
  const source = [JSON.stringify({ t: first.start, c: [{ tx: literal }] }), second.yrc, damaged].join('\n')
  const { lyric, diagnostics } = parseYrc(source)
  assert.deepEqual(
    lyric.lines.map((line) => getEnrichedLineContentText(line.content)),
    [literal, second.text],
  )
  assert.deepEqual(lyric.lines[0]?.time, { start: first.start, end: second.start })
  assert.deepEqual(lyric.meta?.unknowns, [{ key: 'yrc:json', value: damaged }])
  assert.deepEqual(diagnostics, [])
})

test('YRC matches corpus translations at LRC precision without guessing shifted row alignment', () => {
  const first = samples[0]!
  const second = samples[1]!
  const original = first.yrc + '\n' + second.yrc
  const translations = `[${first.timestamp.slice(0, -1)}]${first.translation}\n[${second.timestamp.slice(0, -1)}]${second.translation}`
  const { lyric } = parseYrc({ original, translations })
  assert.deepEqual(
    lyric.lines.map((line) => line.annotation?.translations[0]?.text),
    [first.translation, second.translation],
  )
  const shifted = parseYrc({
    original,
    translations: `[${first.start + 10000}ms]${first.translation}\n[${second.start + 10000}ms]${second.translation}`,
  }).lyric
  assert.ok(shifted.lines.every((line) => line.annotation === undefined))
})

test('YRC recognizes a corpus JSON display row followed by LRC fallback', () => {
  const first = samples[0]!
  const second = samples[2]!
  const source = JSON.stringify({ t: first.start, c: [{ tx: first.text }] }) + '\n' + second.line
  assert.equal(detectFormat(source), 'yrc')
  const { lyric } = parseYrc(source)
  assert.equal(lyric.timing, TimingLevel.LINE)
  assert.deepEqual(
    lyric.lines.map((line) => getEnrichedLineContentText(line.content)),
    [first.text, second.text],
  )
  assert.deepEqual(lyric.lines[0]?.time, { start: first.start, end: second.start })
})
