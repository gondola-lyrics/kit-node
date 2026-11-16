import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EnrichedWordType, TimingLevel } from '@gondola-lyrics/model'

import { detectFormat, parseKrc } from '@root/parser'

const samples = [
  {
    timestamp: '00:20.760',
    start: 20760,
    duration: 5424,
    text: 'Interwoven strokes that rise and breathe',
    translation: '交织的笔触 散发着蓬勃的生命力',
    krc: '[20760,5424]<0,1632,99>Interwoven <1632,832,99>strokes <2464,208,99>that <2672,304,99>rise <2976,944,99>and <3920,1504,99>breathe',
    words: [
      { type: EnrichedWordType.NORMAL, text: 'Interwoven', time: { start: 20760, end: 22392 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'strokes', time: { start: 22392, end: 23224 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'that', time: { start: 23224, end: 23432 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'rise', time: { start: 23432, end: 23736 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'and', time: { start: 23736, end: 24680 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'breathe', time: { start: 24680, end: 26184 } },
    ],
  },
  {
    timestamp: '00:59.142',
    start: 59142,
    duration: 6213,
    text: 'Then it pours out a page of rhythm and rhyme',
    translation: '倾泻而下 奏响自然乐章',
    krc: '[59142,6213]<0,193,99>Then <193,255,99>it <448,353,99>pours <801,1812,99>out <2613,272,99>a <2885,704,99>page <3589,368,99>of <3957,432,99>rhythm <4389,400,99>and <4789,1424,99>rhyme',
    words: [
      { type: EnrichedWordType.NORMAL, text: 'Then', time: { start: 59142, end: 59335 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'it', time: { start: 59335, end: 59590 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'pours', time: { start: 59590, end: 59943 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'out', time: { start: 59943, end: 61755 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'a', time: { start: 61755, end: 62027 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'page', time: { start: 62027, end: 62731 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'of', time: { start: 62731, end: 63099 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'rhythm', time: { start: 63099, end: 63531 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'and', time: { start: 63531, end: 63931 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'rhyme', time: { start: 63931, end: 65355 } },
    ],
  },
  {
    timestamp: '02:58.550',
    start: 178550,
    duration: 9649,
    text: 'I wish you are still by my side',
    translation: '多希望你就在我身旁',
    krc: '[178550,9649]<0,1648,99>I <1648,1488,99>wish <3136,2369,99>you <5505,223,99>are <5728,336,99>still <6064,352,99>by <6416,752,99>my <7168,2481,99>side',
    words: [
      { type: EnrichedWordType.NORMAL, text: 'I', time: { start: 178550, end: 180198 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'wish', time: { start: 180198, end: 181686 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'you', time: { start: 181686, end: 184055 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'are', time: { start: 184055, end: 184278 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'still', time: { start: 184278, end: 184614 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'by', time: { start: 184614, end: 184966 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'my', time: { start: 184966, end: 185718 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'side', time: { start: 185718, end: 188199 } },
    ],
  },
]

test('KRC reads the corpus word offsets relative to each line and ignores the third field', () => {
  for (const sample of samples) {
    const { lyric, diagnostics } = parseKrc(sample.krc)
    assert.deepEqual(lyric.lines[0]?.time, { start: sample.start, end: sample.start + sample.duration })
    assert.deepEqual(
      lyric.lines[0]?.content?.words.map(({ type, text, time }) => ({ type, text, time })),
      sample.words,
    )
    assert.deepEqual(diagnostics, [])
  }
})

test('KRC attaches corpus UTF-8 language tracks before sorting native or LRC fallback rows', () => {
  const reversed = [...samples].reverse()
  const payload = Buffer.from(
    '\uFEFF' +
      JSON.stringify(
        {
          version: 1,
          content: [
            { type: 1, language: 0, lyricContent: reversed.map((sample) => [sample.translation]) },
            { type: 0, language: 0, lyricContent: reversed.map((sample) => [sample.text]) },
          ],
        },
        null,
        2,
      ),
  ).toString('base64')
  for (const original of [
    reversed.map((sample) => sample.krc).join('\n'),
    reversed.map((sample) => `[${sample.timestamp}]${sample.text}`).join('\n'),
  ]) {
    const source = `[LaNgUaGe: ${payload}]\n${original}`
    assert.equal(detectFormat(source), 'krc')
    const { lyric } = parseKrc(source)
    assert.deepEqual(
      lyric.lines.map((line) => line.time?.start),
      samples.map((sample) => sample.start),
    )
    assert.deepEqual(
      lyric.lines.map((line) => line.annotation?.translations[0]?.text),
      samples.map((sample) => sample.translation),
    )
    assert.deepEqual(
      lyric.lines.map((line) => line.annotation?.romans[0]?.content?.text),
      samples.map((sample) => sample.text),
    )
    assert.deepEqual(lyric.meta?.unknowns ?? [], [])
  }
})

test('KRC retains malformed and unsupported corpus language payloads as unknown metadata', () => {
  const sample = samples[1]!
  const payloads = [
    sample.text,
    Buffer.concat([Buffer.from(sample.translation), Buffer.from([0xff])]).toString('base64'),
    Buffer.from(sample.text).toString('base64'),
    Buffer.from(JSON.stringify({ version: 2, content: [[sample.translation]] })).toString('base64'),
    Buffer.from(
      JSON.stringify({ version: 1, content: [{ type: 1, language: 0, lyricContent: samples.map((line) => [line.translation]) }] }),
    ).toString('base64'),
    Buffer.from(JSON.stringify({ version: 1, content: [{ type: 1, language: 1, lyricContent: [[sample.translation]] }] })).toString('base64'),
  ]
  for (const payload of payloads) {
    const { lyric } = parseKrc(`[language:${payload}]\n${sample.krc}`)
    assert.equal(lyric.lines[0]?.annotation, undefined)
    assert.deepEqual(lyric.meta?.unknowns, [{ key: 'language', value: payload }])
  }
})

test('KRC preserves zero-duration corpus content rather than inventing a duration', () => {
  const sample = samples[2]!
  const { lyric, diagnostics } = parseKrc(`[${sample.start},0]<0,0,99>${sample.text}`)
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
