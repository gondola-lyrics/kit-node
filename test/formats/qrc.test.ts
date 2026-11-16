import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EnrichedLyricStatus, EnrichedWordType, getEnrichedLineContentText } from '@gondola-lyrics/model'

import { detectFormat, parseQrc } from '@root/parser'

const samples = [
  {
    start: 7911,
    duration: 4756,
    text: 'I can see the dawn on water’s face',
    translation: '我能看到晨曦倒映在水面上',
    qrc: '[7911,4756]I (7911,192)can (8103,272)see (8375,560)the (8935,432)dawn (9367,816)on (10183,176)water’(10359,272)s (10631,192)face(10823,1844)',
    words: [
      { type: EnrichedWordType.NORMAL, text: 'I', time: { start: 7911, end: 8103 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'can', time: { start: 8103, end: 8375 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'see', time: { start: 8375, end: 8935 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'the', time: { start: 8935, end: 9367 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'dawn', time: { start: 9367, end: 10183 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'on', time: { start: 10183, end: 10359 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'water’', time: { start: 10359, end: 10631 } },
      { type: EnrichedWordType.NORMAL, text: 's', time: { start: 10631, end: 10823 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'face', time: { start: 10823, end: 12667 } },
    ],
  },
  {
    start: 65490,
    duration: 4336,
    text: 'Can we set our sail again',
    translation: '我们能否再次扬帆起航',
    qrc: '[65490,4336]Can (65490,224)we (65714,304)set (66018,368)our (66386,432)sail (66818,1824)again(68642,1184)',
    words: [
      { type: EnrichedWordType.NORMAL, text: 'Can', time: { start: 65490, end: 65714 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'we', time: { start: 65714, end: 66018 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'set', time: { start: 66018, end: 66386 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'our', time: { start: 66386, end: 66818 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'sail', time: { start: 66818, end: 68642 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'again', time: { start: 68642, end: 69826 } },
    ],
  },
  {
    start: 117130,
    duration: 3729,
    text: 'To the beating heart of the sky',
    translation: '奔向蓝天的怀抱',
    qrc: '[117130,3729]To (117130,368)the (117498,304)beating (117802,896)heart (118698,432)of (119130,401)the (119531,639)sky(120170,689)',
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
]

test('QRC reads corpus suffix word tags and preserves an untimed translated suffix', () => {
  const sample = samples[2]!
  const { lyric, diagnostics } = parseQrc(sample.qrc + sample.translation)
  assert.deepEqual(lyric.lines[0]?.time, { start: sample.start, end: sample.start + sample.duration })
  assert.deepEqual(
    lyric.lines[0]?.content?.words.map(({ type, text, time }) => ({ type, text, time })),
    [...sample.words, { type: EnrichedWordType.NORMAL, text: sample.translation, time: undefined }],
  )
  assert.equal(getEnrichedLineContentText(lyric.lines[0]?.content), sample.text + sample.translation)
  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'line.word.time.missing'))
})

test('QRC unwraps corpus XML roots, embedded newlines, and entities exactly once', () => {
  const plain = samples.map((sample) => sample.qrc).join('\n') + ` &amp; ${samples[0]!.translation}`
  const payload = plain.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('\n', '&#10;')
  for (const source of [
    `<QrcInfos><LyricInfo><Lyric_1 LyricContent="${payload}"/></LyricInfo></QrcInfos>`,
    `<LyricInfo><Lyric_1 LyricContent="${payload}"/></LyricInfo>`,
    `<q:Lyric_1 xmlns:q="urn:qrc" LyricContent="${payload}"/>`,
  ]) {
    assert.equal(detectFormat(source), 'qrc')
    assert.deepEqual(parseQrc(source), parseQrc(plain))
  }
})

test('QRC rejects broken or unrelated XML even when it contains corpus lyrics', () => {
  const payload = samples[0]!.qrc.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  for (const source of [`<other LyricContent="${payload}"/>`, `<QrcInfos><Lyric_1 LyricContent="${payload}"/></wrong>`, '<QrcInfos/>']) {
    assert.equal(detectFormat(source), undefined)
    const { lyric } = parseQrc(source)
    assert.equal(lyric.status, EnrichedLyricStatus.INVALID)
    assert.deepEqual(lyric.lines, [])
  }
})

test('QRC keeps duplicate corpus placeholder slots until translations have been matched', () => {
  const first = samples[0]!
  const second = samples[1]!
  const placeholder = `[${first.start},${first.duration}]//`
  const { lyric, diagnostics } = parseQrc({
    original: `${placeholder}\n${first.qrc}\n${second.qrc}`,
    translations: `${placeholder}\n[${first.start},${first.duration}]${first.translation}\n[${second.start},${second.duration}]${second.translation}`,
  })
  assert.equal(lyric.lines.length, 2)
  assert.deepEqual(
    lyric.lines.map((line) => line.annotation?.translations[0]?.text),
    [first.translation, second.translation],
  )
  assert.deepEqual(diagnostics, [])
})

test('QRC ruby coverage uses a corpus translation and its paired Latin text without changing timing', () => {
  const sample = samples[0]!
  const duration = sample.duration
  const source =
    `[kana:${[...sample.translation].length}${sample.text}(${sample.start},${duration})]\n` +
    `[${sample.start},${duration}]${sample.translation}(${sample.start},${duration})`
  const { lyric, diagnostics } = parseQrc(source)
  const word = lyric.lines[0]?.content?.words[0]
  assert.ok(word)
  assert.equal(word.text, sample.translation)
  assert.deepEqual(word.time, { start: sample.start, end: sample.start + duration })
  assert.equal(word.annotation?.rubies[0]?.tokens[0]?.text, sample.text)
  assert.deepEqual(word.annotation?.rubies[0]?.tokens[0]?.time, word.time)
  assert.deepEqual(lyric.meta?.unknowns ?? [], [])
  assert.deepEqual(diagnostics, [])
})
