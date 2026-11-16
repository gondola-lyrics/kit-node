import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EnrichedLineType } from '@gondola-lyrics/model'

import { insertInstrumentalLines, parseKrc } from '@root/parser'

const original =
  '[130748,6496]<0,256,0>Like <256,1504,0>grandpa <1760,624,0>once <2384,896,0>did <3280,256,0>and <3536,448,0>sing <3984,320,0>her <4304,416,0>a <4720,1776,0>lullaby\n' +
  '[143534,3392]<0,448,0>Clouds <448,272,0>and <720,1168,0>rainbow <1888,1504,0>intertwined\n' +
  "[163908,5439]<0,335,0>I'm <335,384,0>still <719,2673,0>figuring <3392,495,0>out <3887,368,0>my <4255,1184,0>life"

test('instrumental insertion uses actual corpus word ends and remains stable on repeat calls', () => {
  const { lyric } = parseKrc(original)
  const before = structuredClone(lyric)
  const result = insertInstrumentalLines(lyric, { minDuration: 5000, endTime: 180000 })
  assert.deepEqual(
    result.lines.filter((line) => line.type === EnrichedLineType.INSTRUMENTAL).map((line) => line.time),
    [
      { start: 0, end: 130748 },
      { start: 137244, end: 143534 },
      { start: 146926, end: 163908 },
      { start: 169347, end: 180000 },
    ],
  )
  const retained = result.lines.filter((line) => line.type === EnrichedLineType.NORMAL)
  for (const [index, line] of retained.entries()) {
    assert.equal(line, lyric.lines[index])
  }
  assert.equal(insertInstrumentalLines(result, { minDuration: 5000, endTime: 180000 }), result)
  assert.deepEqual(lyric, before)
})

test('instrumental insertion does not guess an outro or later gaps from unknown corpus bounds', () => {
  const { lyric } = parseKrc('[offset:0][length:180000]\n' + original)
  const result = insertInstrumentalLines(lyric, { minIntroDuration: 200000, minDuration: 200000 })
  assert.equal(result, lyric)
  for (const time of [{ start: 130748 }, { start: 130748, end: 130000 }]) {
    const source = parseKrc(original).lyric
    const first = source.lines[0]
    assert.ok(first)
    first.time = time
    assert.equal(insertInstrumentalLines(source, { minIntroDuration: 200000, endTime: 180000 }), source)
  }
})

test('instrumental insertion rejects invalid options against the selected corpus', () => {
  const { lyric } = parseKrc(original)
  for (const value of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => insertInstrumentalLines(lyric, { minDuration: value }), RangeError)
    assert.throws(() => insertInstrumentalLines(lyric, { minIntroDuration: value }), RangeError)
  }
  for (const endTime of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 31]) {
    assert.throws(() => insertInstrumentalLines(lyric, { endTime }), RangeError)
  }
})
