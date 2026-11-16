import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeEnrichedLineBackground, makeEnrichedWordEmphasis } from '@gondola-lyrics/model'

import { deriveWordEmphasis, parseLrc } from '@root/parser'

const original =
  '[00:20.760]<0,1632>Interwoven <1632,832>strokes <2464,208>that <2672,304>rise <2976,944>and <3920,1504>breathe\n' +
  '[01:51.546]<0,320>Can <320,336>we <656,496>set <1152,320>our <1472,1616>sail <3088,1392>again\n' +
  '[02:00.912]<0,321>Where <321,1295>grandma <1616,368>resting <1984,448>her <2432,592>smile'

test('word emphasis uses corpus durations and preserves manual flags across lead and background content', () => {
  const { lyric } = parseLrc(original)
  const first = lyric.lines[0]
  const second = lyric.lines[1]
  const third = lyric.lines[2]
  assert.ok(first && second && third)
  const interwoven = first.content?.words.find((word) => word.text === 'Interwoven')
  const breathe = first.content?.words.find((word) => word.text === 'breathe')
  const that = first.content?.words.find((word) => word.text === 'that')
  assert.ok(interwoven && breathe && that)
  breathe.emphasis = makeEnrichedWordEmphasis({ value: false, derived: false })
  that.emphasis = makeEnrichedWordEmphasis({ value: true, derived: false })
  first.backgrounds = [makeEnrichedLineBackground({ time: second.time, content: second.content })]
  const before = structuredClone(lyric)
  const result = deriveWordEmphasis(lyric, { durationThreshold: 1295 })
  const words = result.lines[0]?.content?.words
  assert.ok(words)
  assert.deepEqual(words.find((word) => word.text === 'Interwoven')?.emphasis, { value: true, derived: true })
  assert.equal(
    words.find((word) => word.text === 'breathe'),
    breathe,
  )
  assert.equal(
    words.find((word) => word.text === 'that'),
    that,
  )
  assert.deepEqual(result.lines[0]?.backgrounds[0]?.content?.words.find((word) => word.text === 'sail')?.emphasis, { value: true, derived: true })
  assert.equal(result.lines[2]?.content?.words.find((word) => word.text === 'grandma')?.emphasis, undefined)
  assert.equal(deriveWordEmphasis(result, { durationThreshold: 1295 }), result)
  assert.deepEqual(lyric, before)
})

test('word emphasis clears derived corpus flags when the threshold or valid word bounds change', () => {
  const { lyric } = parseLrc(original)
  const derived = deriveWordEmphasis(lyric, { durationThreshold: 1500 })
  assert.equal(derived.lines[0]?.content?.words[0]?.emphasis?.value, true)
  const raised = deriveWordEmphasis(derived, { durationThreshold: 1632 })
  assert.equal(raised.lines[0]?.content?.words[0]?.emphasis, undefined)
  assert.equal(derived.lines[0]?.content?.words[0]?.emphasis?.value, true)
  for (const time of [{ start: 20760 }, { start: 20760, end: 20000 }]) {
    const source = structuredClone(derived)
    const word = source.lines[0]?.content?.words[0]
    assert.ok(word)
    word.time = time
    assert.equal(deriveWordEmphasis(source, { durationThreshold: 1500 }).lines[0]?.content?.words[0]?.emphasis, undefined)
    assert.equal(word.emphasis?.value, true)
  }
})

test('word emphasis rejects unsafe or malformed thresholds with corpus input', () => {
  const { lyric } = parseLrc(original)
  for (const durationThreshold of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => deriveWordEmphasis(lyric, { durationThreshold }), RangeError)
  }
})
