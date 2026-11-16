import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EnrichedWordType, TimingLevel, getEnrichedLineContentText } from '@gondola-lyrics/model'

import { detectFormat, parseKwrc } from '@root/parser'

const samples = [
  {
    timestamp: '00:32.712',
    start: 32712,
    duration: 3840,
    text: 'Feathers shed their golden gleam',
    translation: '轻盈的羽毛闪耀金光',
    kwrc: '[00:32.712]<512,-512>Feathers <1088,-64>shed <1408,768>their <3040,-224>golden <3840,2240>gleam',
    words: [
      { type: EnrichedWordType.NORMAL, text: 'Feathers', time: { start: 32712, end: 33224 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'shed', time: { start: 33224, end: 33800 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'their', time: { start: 33800, end: 34120 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'golden', time: { start: 34120, end: 35752 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'gleam', time: { start: 35752, end: 36552 } },
    ],
  },
  {
    timestamp: '00:51.771',
    start: 51771,
    duration: 7221,
    text: 'When time is fluid like red wine in my bottle',
    translation: '时光如佳酿 缓缓流淌',
    kwrc: '[00:51.771]<241,-241>When <992,-510>time <1249,735>is <3520,-1022>fluid <3792,3248>like <4128,3456>red <4448,3808>wine <4816,4080>in <5329,4303>my <7221,3437>bottle',
    words: [
      { type: EnrichedWordType.NORMAL, text: 'When', time: { start: 51771, end: 52012 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'time', time: { start: 52012, end: 52763 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'is', time: { start: 52763, end: 53020 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'fluid', time: { start: 53020, end: 55291 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'like', time: { start: 55291, end: 55563 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'red', time: { start: 55563, end: 55899 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'wine', time: { start: 55899, end: 56219 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'in', time: { start: 56219, end: 56587 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'my', time: { start: 56587, end: 57100 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'bottle', time: { start: 57100, end: 58992 } },
    ],
  },
  {
    timestamp: '01:51.546',
    start: 111546,
    duration: 4480,
    text: 'Can we set our sail again',
    translation: '我们能否再次扬帆起航',
    kwrc: '[01:51.546]<320,-320>Can <656,-16>we <1152,160>set <1472,832>our <3088,-144>sail <4480,1696>again',
    words: [
      { type: EnrichedWordType.NORMAL, text: 'Can', time: { start: 111546, end: 111866 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'we', time: { start: 111866, end: 112202 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'set', time: { start: 112202, end: 112698 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'our', time: { start: 112698, end: 113018 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'sail', time: { start: 113018, end: 114634 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'again', time: { start: 114634, end: 116026 } },
    ],
  },
]

test('KWRC decodes octal parameters and the selected corpus word ranges', () => {
  const source = '[kuwo:13]\n[offset:0]\n' + samples.map((sample) => sample.kwrc).join('\n')
  assert.equal(detectFormat(source), 'kwrc')
  const { lyric, diagnostics } = parseKwrc(source)
  assert.equal(lyric.timing, TimingLevel.WORD)
  assert.equal(lyric.meta?.offset, 0)
  assert.deepEqual(
    lyric.lines.map((line) => getEnrichedLineContentText(line.content)),
    samples.map((sample) => sample.text),
  )
  for (const [index, sample] of samples.entries()) {
    assert.deepEqual(
      lyric.lines[index]?.content?.words.map(({ type, text, time }) => ({ type, text, time })),
      sample.words,
    )
  }
  assert.deepEqual(diagnostics, [])
})

test('KWRC retains corpus rows when encoded scales or calculations are unreliable', () => {
  const first = samples[0]!
  const next = samples[1]!
  const body = first.kwrc.slice(first.kwrc.indexOf(']') + 1)
  const cases = [
    ['[kuwo:13]\n[kuwo:14]\n', body],
    ['[kuwo:18]\n', body],
    ['', body],
    ['[kuwo:13]\n', body.replace('<512,-512>', '<512,-511>')],
    ['[kuwo:13]\n', body.replace('<512,-512>', '<9007199254740992,0>')],
  ] as const
  for (const [metadata, text] of cases) {
    const { lyric } = parseKwrc(`${metadata}[${first.timestamp}]${text}\n[${next.timestamp}]`)
    assert.equal(lyric.timing, TimingLevel.LINE)
    assert.equal(lyric.lines[0]?.content?.text, text)
    assert.deepEqual(lyric.lines[0]?.content?.words, [])
    assert.deepEqual(lyric.lines[0]?.time, { start: first.start, end: next.start })
  }
})

test('KWRC aligns the selected corpus translations through complete bilingual slots', () => {
  const first = samples[0]!
  const second = samples[1]!
  const end = samples[2]!
  const source =
    `[ml:1.0]\n[${first.timestamp}]${first.text}\n[${second.timestamp}]${first.translation}\n` +
    `[${second.timestamp}]${second.text}\n[${end.timestamp}]${second.translation}\n[${end.timestamp}]`
  assert.equal(detectFormat(source), 'kwrc')
  const { lyric, diagnostics } = parseKwrc(source)
  assert.deepEqual(
    lyric.lines.map((line) => getEnrichedLineContentText(line.content)),
    [first.text, second.text],
  )
  assert.deepEqual(
    lyric.lines.map((line) => line.time),
    [
      { start: first.start, end: second.start },
      { start: second.start, end: end.start },
    ],
  )
  assert.deepEqual(
    lyric.lines.map((line) => line.annotation?.translations[0]?.text),
    [first.translation, second.translation],
  )
  assert.deepEqual(diagnostics, [])
})

test('KWRC leaves incomplete corpus bilingual sequences unaligned', () => {
  const first = samples[0]!
  const second = samples[1]!
  const end = samples[2]!
  const source =
    `[ml:1.0]\n[${first.timestamp}]${first.text}\n[${second.timestamp}]${first.translation}\n` +
    `[${second.timestamp}]${second.text}\n[${end.timestamp}]${second.translation}`
  assert.equal(detectFormat(source), 'lrc')
  const { lyric } = parseKwrc(source)
  assert.deepEqual(
    lyric.lines.map((line) => getEnrichedLineContentText(line.content)),
    [first.text, first.translation, second.text, second.translation],
  )
  assert.ok(lyric.lines.every((line) => line.annotation === undefined))
})
