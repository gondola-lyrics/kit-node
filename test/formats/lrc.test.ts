import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EnrichedLineType, EnrichedWordType, TimingLevel, getEnrichedLineContentText } from '@gondola-lyrics/model'

import { generateLrc } from '@root/generator'
import { parseLrc } from '@root/parser'

const samples = [
  {
    timestamp: '01:31.679',
    start: 91679,
    duration: 5520,
    text: 'Was it yesterday was it last year',
    translation: '是昨天 还是去年',
    lrc: '[01:31.679]<0,320>Was <320,400>it <720,2464>yesterday <3184,449>was <3633,399>it <4032,624>last <4656,864>year',
    words: [
      { type: EnrichedWordType.NORMAL, text: 'Was', time: { start: 91679, end: 91999 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'it', time: { start: 91999, end: 92399 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'yesterday', time: { start: 92399, end: 94863 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'was', time: { start: 94863, end: 95312 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'it', time: { start: 95312, end: 95711 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'last', time: { start: 95711, end: 96335 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'year', time: { start: 96335, end: 97199 } },
    ],
    absolute:
      '[01:31.679]<01:31.679,320>Was <01:31.999,400>it <01:32.399,2464>yesterday <01:34.863,449>was <01:35.312,399>it <01:35.711,624>last <01:36.335,864>year',
    open: '[01:31.679]<0>Was <320>it <720>yesterday <3184>was <3633>it <4032>last <4656>year<5520>',
    tags: '<0><320><720><3184><3633><4032><4656>',
  },
  {
    timestamp: '01:57.130',
    start: 117130,
    duration: 3729,
    text: 'To the beating heart of the sky',
    translation: '奔向蓝天的怀抱',
    lrc: '[01:57.130]<0,368>To <368,304>the <672,896>beating <1568,432>heart <2000,401>of <2401,639>the <3040,689>sky',
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
    timestamp: '02:27.310',
    start: 147310,
    duration: 3152,
    text: 'Blurring up my track of time',
    translation: '模糊了我的时间轨迹',
    lrc: '[02:27.310]<0,593>Blurring <593,399>up <992,353>my <1345,671>track <2016,512>of <2528,624>time',
    words: [
      { type: EnrichedWordType.NORMAL, text: 'Blurring', time: { start: 147310, end: 147903 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'up', time: { start: 147903, end: 148302 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'my', time: { start: 148302, end: 148655 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'track', time: { start: 148655, end: 149326 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'of', time: { start: 149326, end: 149838 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'time', time: { start: 149838, end: 150462 } },
    ],
  },
] as const

test('LRC sorts stacked corpus timestamps and uses the next strictly later boundary', () => {
  const [first, second, third] = samples
  assert.ok(first && second && third)
  const source = `[${third.timestamp}][${first.timestamp}]${first.text}\n[${second.timestamp}]${second.text}\n[${third.timestamp}]${third.text}`
  const { lyric } = parseLrc(source)
  assert.deepEqual(
    lyric.lines.map((line) => [getEnrichedLineContentText(line.content), line.time?.start, line.time?.end]),
    [
      [first.text, first.start, second.start],
      [second.text, second.start, third.start],
      [first.text, third.start, undefined],
      [third.text, third.start, undefined],
    ],
  )
})

test('LRC preserves corpus metadata, mixed newlines, and literal non-timing brackets', () => {
  const first = samples[0]!
  const second = samples[1]!
  const text = `${first.text} [${first.translation}] <${second.text}>`
  for (const offset of [0, -250]) {
    const source =
      `[offset:${offset}][ti:${first.text}][length:${second.timestamp}][custom:${first.translation}]\r\n` +
      `[${first.timestamp}]${text}\r[${second.timestamp}]`
    const { lyric } = parseLrc(source)
    assert.equal(lyric.meta?.titles[0]?.text, first.text)
    assert.equal(lyric.meta?.duration, second.start)
    assert.equal(lyric.meta?.offset, offset)
    assert.deepEqual(lyric.meta?.unknowns, [{ key: 'custom', value: first.translation }])
    assert.equal(lyric.lines[0]?.content?.text, text)
    assert.deepEqual(lyric.lines[0]?.time, { start: first.start, end: second.start })
    assert.equal(lyric.lines[1]?.type, EnrichedLineType.INSTRUMENTAL)
  }
})

test('LRC reads corpus relative offsets, absolute clocks, and empty closing word tags', () => {
  const sample = samples[0]!
  for (const source of [sample.lrc, sample.absolute, sample.open]) {
    const { lyric, diagnostics } = parseLrc(source)
    assert.equal(lyric.timing, TimingLevel.WORD)
    assert.deepEqual(lyric.lines[0]?.time, { start: sample.start, end: sample.start + sample.duration })
    assert.deepEqual(
      lyric.lines[0]?.content?.words.map(({ type, text, time }) => ({ type, text, time })),
      sample.words,
    )
    assert.deepEqual(diagnostics, [])
  }
})

test('LRC corpus timing tags become instrumental when their text is removed', () => {
  const first = samples[0]!
  const second = samples[1]!
  const tags = first.tags
  const { lyric } = parseLrc(`[${first.timestamp}]${tags}\n[${second.timestamp}]${second.text}`)
  assert.equal(lyric.lines[0]?.type, EnrichedLineType.INSTRUMENTAL)
  assert.deepEqual(lyric.lines[0]?.time, { start: first.start, end: second.start })
  assert.equal(lyric.lines[0]?.content, undefined)
  assert.equal(lyric.lines[1]?.content?.text, second.text)
})

test('LRC assigns exact corpus translations first and applies tolerance only to drifting rows', () => {
  const first = samples[0]!
  const second = samples[1]!
  const third = samples[2]!
  const input = {
    original: samples.map((sample) => `[${sample.timestamp}]${sample.text}`).join('\n'),
    translations: [
      `[${first.start + 300}ms]${first.translation}`,
      `[${first.timestamp}]${first.translation}`,
      `[${second.start + 300}ms]${second.translation}`,
      `[${third.start + 10000}ms]${third.translation}`,
    ].join('\n'),
  }
  const strict = parseLrc(input).lyric
  assert.equal(strict.lines[0]?.annotation?.translations[0]?.text, first.translation)
  assert.equal(strict.lines[1]?.annotation, undefined)
  const tolerant = parseLrc(input, { annotationTolerance: 500 }).lyric
  assert.deepEqual(
    tolerant.lines.map((line) => line.annotation?.translations[0]?.text),
    [first.translation, second.translation, undefined],
  )
  assert.equal(tolerant.lines[0]?.annotation?.translations.length, 1)
})

test('LRC attaches corpus Latin text as timed roman tokens without changing the original words', () => {
  const sample = samples[2]!
  const { lyric, diagnostics } = parseLrc({ original: sample.lrc, romans: sample.lrc })
  const words = lyric.lines[0]?.content?.words.filter((word) => word.type === EnrichedWordType.NORMAL)
  assert.ok(words)
  const expected = sample.words.filter((word) => word.type === EnrichedWordType.NORMAL)
  assert.deepEqual(
    words.map((word) => word.time),
    expected.map((word) => word.time),
  )
  assert.deepEqual(
    words.map((word) => word.annotation?.romans[0]?.tokens[0]?.text),
    expected.map((word) => word.text),
  )
  assert.deepEqual(
    words.map((word) => word.annotation?.romans[0]?.tokens[0]?.time),
    expected.map((word) => word.time),
  )
  assert.deepEqual(diagnostics, [])
})

test('LRC generation round-trips selected corpus words, translations, and timed romanization', () => {
  const parsed = parseLrc({
    original: '[offset:0]\n' + samples.map((sample) => sample.lrc).join('\n'),
    translations: samples.map((sample) => `[${sample.timestamp}]${sample.translation}`).join('\n'),
    romans: samples.map((sample) => sample.lrc).join('\n'),
  })
  const generated = generateLrc(parsed.lyric, { includeWordEnd: true })
  assert.ok(generated.translations)
  assert.ok(generated.romans)
  assert.deepEqual(parseLrc(generated), parsed)
})
