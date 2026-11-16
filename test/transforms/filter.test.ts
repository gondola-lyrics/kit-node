import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TimingLevel, getEnrichedLineContentText, makeEnrichedLineBackground, makeEnrichedLineContentText } from '@gondola-lyrics/model'

import { parseLrc, removeNonLyricLines } from '@root/parser'

const musicInfo = {
  title: '悠忽舞于梦中',
  artists: ['测试制作团队', 'TestComposer', 'Test Vocal'],
  text: '悠忽舞于梦中 - 测试制作团队/TestComposer/Test Vocal',
  original:
    '[00:00.000]<0,66>悠<66,66>忽<133,66>舞<199,66>于<266,66>梦<332,66>中<399,66> - <465,66>测<532,66>试<598,66>制<665,66>作<731,66>团<798,66>队<864,66>/<931,66>TestComposer/<997,66>Test <1064,66>Vocal',
}

test('studio filtering removes the corpus studio line while preserving mixing credits, lyrics, and translations', () => {
  const mixer = {
    label: '混音师 Mixing Engineer',
    name: '测试员@Test Studio',
    original:
      '[00:03.524]<0,66>混<66,66>音<133,66>师<199,66> <266,66>Mixing <332,66>Engineer：<399,66>测<465,66>试<532,66>员<598,66>@<664,66>Test <731,66>Studio',
  }
  const studio = {
    label: '录音棚 Studio',
    name: '测试专用虚拟录音棚',
    original:
      '[00:05.252]<0,66>录<67,66>音<133,66>棚<200,66> <266,66>Studio：<333,66>测<399,66>试<466,66>专<532,66>用<599,66>虚<665,66>拟<732,66>录<798,66>音<865,66>棚',
  }
  const body = [
    {
      timestamp: '02:23.534',
      start: 143534,
      duration: 3392,
      text: 'Clouds and rainbow intertwined',
      translation: '彩虹与白云交织在一起',
      line: '[02:23.534]Clouds and rainbow intertwined',
    },
    {
      timestamp: '02:33.831',
      start: 153831,
      duration: 3120,
      text: "Like I'm still that kid",
      translation: '仿佛我还是那个',
      line: "[02:33.831]Like I'm still that kid",
    },
    {
      timestamp: '02:37.039',
      start: 157039,
      duration: 6561,
      text: 'Knowing nothing about how to fish and how to live',
      translation: '对钓鱼和生活都一窍不通的孩子',
      line: '[02:37.039]Knowing nothing about how to fish and how to live',
    },
  ]
  const { lyric } = parseLrc({
    original: [mixer.original, studio.original, ...body.map((sample) => sample.line)].join('\n'),
    translations: body.map((sample) => `[${sample.timestamp}]${sample.translation}`).join('\n'),
  })
  const studioLine = lyric.lines[1]
  assert.ok(studioLine)
  studioLine.annotation = lyric.lines[2]?.annotation
  studioLine.backgrounds = [makeEnrichedLineBackground({ time: studioLine.time, content: makeEnrichedLineContentText(body[0]!.text) })]
  const original = structuredClone(lyric)
  assert.equal(removeNonLyricLines(lyric, { categories: ['copyright'] }), lyric)

  const result = removeNonLyricLines(lyric, { categories: ['studio'] })
  assert.deepEqual(result.lines, [lyric.lines[0], ...lyric.lines.slice(2)])
  assert.equal(result.lines[0], lyric.lines[0])
  assert.deepEqual(
    result.lines.map((line) => getEnrichedLineContentText(line.content)),
    [`${mixer.label}：${mixer.name}`, ...body.map((sample) => sample.text)],
  )
  assert.deepEqual(
    result.lines.slice(1).map((line) => line.annotation?.translations[0]?.text),
    body.map((sample) => sample.translation),
  )
  assert.ok(result.lines.every((line) => line.backgrounds.length === 0))
  assert.equal(result.timing, TimingLevel.WORD)
  assert.deepEqual(removeNonLyricLines(lyric).lines, result.lines)
  assert.deepEqual(lyric, original)
})

test('music information filtering requires explicit corpus names and removes only the first matching information line', () => {
  const body = [
    {
      timestamp: '02:23.534',
      start: 143534,
      duration: 3392,
      text: 'Clouds and rainbow intertwined',
      translation: '彩虹与白云交织在一起',
      line: '[02:23.534]Clouds and rainbow intertwined',
    },
    {
      timestamp: '02:33.831',
      start: 153831,
      duration: 3120,
      text: "Like I'm still that kid",
      translation: '仿佛我还是那个',
      line: "[02:33.831]Like I'm still that kid",
    },
    {
      timestamp: '02:37.039',
      start: 157039,
      duration: 6561,
      text: 'Knowing nothing about how to fish and how to live',
      translation: '对钓鱼和生活都一窍不通的孩子',
      line: '[02:37.039]Knowing nothing about how to fish and how to live',
    },
  ]
  const last = {
    timestamp: '02:37.039',
    start: 157039,
    duration: 6561,
    text: 'Knowing nothing about how to fish and how to live',
    translation: '对钓鱼和生活都一窍不通的孩子',
    line: '[02:37.039]Knowing nothing about how to fish and how to live',
  }
  const { lyric } = parseLrc({
    original: [musicInfo.original, ...body.map((sample) => sample.line), `[${last.start + last.duration}ms]${musicInfo.text}`].join('\n'),
    translations: body.map((sample) => `[${sample.timestamp}]${sample.translation}`).join('\n'),
  })
  const original = structuredClone(lyric)
  assert.equal(removeNonLyricLines(lyric, { categories: [] }), lyric)
  assert.equal(removeNonLyricLines(lyric, { categories: [], musicInfo: { titles: [musicInfo.title] } }), lyric)

  const result = removeNonLyricLines(lyric, { categories: [], musicInfo: { titles: [musicInfo.title], artists: musicInfo.artists } })
  assert.deepEqual(result.lines, lyric.lines.slice(1))
  assert.equal(result.lines[0], lyric.lines[1])
  assert.deepEqual(
    result.lines.map((line) => getEnrichedLineContentText(line.content)),
    [...body.map((sample) => sample.text), musicInfo.text],
  )
  assert.deepEqual(
    result.lines.slice(0, body.length).map((line) => line.annotation?.translations[0]?.text),
    body.map((sample) => sample.translation),
  )
  assert.equal(result.timing, TimingLevel.LINE)
  assert.deepEqual(lyric, original)
})
