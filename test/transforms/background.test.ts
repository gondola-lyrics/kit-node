import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EnrichedWordType, getEnrichedLineContentText } from '@gondola-lyrics/model'

import { extractBackgroundLines, parseLrc } from '@root/parser'

test('inline background extraction keeps selected corpus words, timings, and paired annotations', () => {
  const { lyric } = parseLrc({
    original:
      '[02:10.748]<0,256>Like <256,1504>(grandpa <1760,624>once)<2384,896> did <3280,256>and <3536,448>sing <3984,320>her <4304,416>a <4720,1776>lullaby',
    romans:
      '[02:10.748]<0,256>Like <256,1504>grandpa <1760,624>once<2384,896> did <3280,256>and <3536,448>sing <3984,320>her <4304,416>a <4720,1776>lullaby',
    translations: '[02:10.748]就像(爷爷)那样给她唱首摇篮曲',
  })
  const original = structuredClone(lyric)
  const sourceWords = lyric.lines[0]?.content?.words.filter((word) => word.type === EnrichedWordType.NORMAL)
  assert.ok(sourceWords?.[1]?.annotation)
  const result = extractBackgroundLines(lyric)
  const lead = result.lines[0]
  assert.ok(lead)
  assert.equal(getEnrichedLineContentText(lead.content), 'Like  did and sing her a lullaby')
  assert.deepEqual(lead.time, { start: 130748, end: 137244 })
  assert.equal(lead.annotation?.translations[0]?.text, '就像那样给她唱首摇篮曲')
  const background = lead.backgrounds[0]
  assert.ok(background)
  const words = background.content?.words.filter((word) => word.type === EnrichedWordType.NORMAL)
  assert.ok(words)
  assert.equal(getEnrichedLineContentText(background.content), 'grandpa once')
  assert.deepEqual(background.time, { start: 131004, end: 133132 })
  assert.deepEqual(
    words.map((word) => word.time),
    [
      { start: 131004, end: 132508 },
      { start: 132508, end: 133132 },
    ],
  )
  assert.deepEqual(
    words.map((word) => word.annotation),
    sourceWords.slice(1, 3).map((word) => word.annotation),
  )
  assert.equal(background.annotation?.translations[0]?.text, '爷爷')
  assert.deepEqual(lyric, original)
})

test('cross-line extraction keeps separate corpus backgrounds and the original lead roman range', () => {
  const { lyric } = parseLrc({
    original:
      '[01:05.490]Can we set our sail again\n[02:10.748](Like grandpa once did and sing her a lullaby\n[02:17.884]I dreamed about it all last night)\n[02:23.534]Clouds and rainbow intertwined',
    romans:
      '[01:05.490]Can we set our sail again\n[02:10.748]Like grandpa once did and sing her a lullaby\n[02:17.884]I dreamed about it all last night',
    translations: '[02:10.748]就像爷爷那样给她唱首摇篮曲\n[02:17.884]昨晚我整晚做的都是这个梦',
  })
  const first = lyric.lines[1]
  const second = lyric.lines[2]
  assert.ok(first && second)
  first.id = 'lullaby'
  second.id = 'night'
  const original = structuredClone(lyric)
  const result = extractBackgroundLines(lyric)
  const lead = result.lines[0]
  assert.ok(lead)
  assert.equal(result.lines.length, 2)
  assert.equal(result.lines[1], lyric.lines[3])
  assert.deepEqual(lead.time, { start: 65490, end: 143534 })
  assert.deepEqual(lead.annotation?.romans[0]?.time, { start: 65490, end: 130748 })
  assert.deepEqual(
    lead.backgrounds.map((background) => background.id),
    ['lullaby', 'night'],
  )
  assert.deepEqual(
    lead.backgrounds.map((background) => background.time),
    [
      { start: 130748, end: 137884 },
      { start: 137884, end: 143534 },
    ],
  )
  assert.deepEqual(
    lead.backgrounds.map((background) => background.annotation),
    [first.annotation, second.annotation],
  )
  assert.deepEqual(lyric, original)
})

test('background extraction retains unbalanced corpus brackets and indivisible word annotations', () => {
  for (const source of [
    '[02:10.748]Like (grandpa once did and sing her a lullaby',
    '[02:17.884]I dreamed about it all last night)',
    '[01:05.490]Can we set our sail again\n[02:10.748](Like grandpa once did and sing her a lullaby\n[02:17.884]I dreamed about it all last night',
  ]) {
    const { lyric } = parseLrc(source)
    assert.equal(extractBackgroundLines(lyric), lyric)
  }
  const { lyric } = parseLrc({
    original: '[02:10.748]<0,256>Like(grandpa)',
    romans: '[02:10.748]<0,256>Like',
  })
  assert.ok(lyric.lines[0]?.content?.words[0]?.annotation)
  assert.equal(extractBackgroundLines(lyric), lyric)
})
