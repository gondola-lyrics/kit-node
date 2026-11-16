import assert from 'node:assert/strict'
import { test } from 'node:test'

import { formatTime, parseTime } from '@root/utils/time'

const samples = [
  {
    timestamp: '02:58.550',
    start: 178550,
    text: 'I wish you are still by my side',
    translation: '多希望你就在我身旁',
  },
  {
    timestamp: '01:57.130',
    start: 117130,
    text: 'To the beating heart of the sky',
    translation: '奔向蓝天的怀抱',
  },
  {
    timestamp: '02:37.039',
    start: 157039,
    text: 'Knowing nothing about how to fish and how to live',
    translation: '对钓鱼和生活都一窍不通的孩子',
  },
]

test('time parsing reads corpus timestamps, fractional precision, and equivalent unit offsets', () => {
  for (const sample of samples) {
    assert.equal(parseTime(sample.timestamp), sample.start)
    assert.equal(parseTime(`00:${sample.timestamp}`), sample.start)
    assert.equal(parseTime(`${sample.timestamp}9`), sample.start)
    assert.equal(parseTime(`${sample.start}ms`), sample.start)
    assert.equal(parseTime(`${sample.start / 1000}s`), sample.start)
    assert.equal(parseTime(` ${sample.start}MS `), sample.start)
  }
  assert.equal(parseTime('02:58.55'), samples[0]!.start)
  assert.equal(parseTime('01:57.13'), samples[1]!.start)
})

test('time parsing rejects corpus text, bare timestamps, and damaged clock values', () => {
  for (const sample of samples) {
    for (const source of [
      sample.text,
      sample.translation,
      String(sample.start),
      `-${sample.start}ms`,
      `${sample.timestamp}.1`,
      sample.timestamp.replace(':', '::'),
    ]) {
      assert.equal(parseTime(source), undefined)
    }
  }
})

test('time formatting preserves corpus precision and carries hours into omitted minute fields', () => {
  for (const sample of samples) {
    assert.equal(formatTime(sample.start), sample.timestamp)
    assert.equal(formatTime(sample.start + 0.9), sample.timestamp)
    assert.equal(formatTime(sample.start, 'mm:ss.SS'), sample.timestamp.slice(0, -1))
    assert.equal(formatTime(sample.start + 3600000, 'hh:mm:ss.SSS'), `01:${sample.timestamp}`)
    const totalMinutes = Math.floor(sample.start / 60000) + 60
    assert.equal(formatTime(sample.start + 3600000), `${totalMinutes}:${sample.timestamp.split(':')[1]}`)
  }
  for (const time of [-samples[0]!.start, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(formatTime(time), '00:00.000')
  }
})
