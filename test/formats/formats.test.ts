import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EnrichedLineType, EnrichedLyricStatus, getEnrichedLineContentText, validateEnrichedLyric } from '@gondola-lyrics/model'

import { detectFormat, parse, parseKrc, parseKwrc, parseLrc, parseQrc, parseTtml, parseYrc } from '@root/parser'

const samples = [
  {
    timestamp: '00:59.142',
    start: 59142,
    duration: 6213,
    text: 'Then it pours out a page of rhythm and rhyme',
    translation: '倾泻而下 奏响自然乐章',
    lrc: '[00:59.142]<0,193>Then <193,255>it <448,353>pours <801,1812>out <2613,272>a <2885,704>page <3589,368>of <3957,432>rhythm <4389,400>and <4789,1424>rhyme',
    qrc: '[59142,6213]Then (59142,193)it (59335,255)pours (59590,353)out (59943,1812)a (61755,272)page (62027,704)of (62731,368)rhythm (63099,432)and (63531,400)rhyme(63931,1424)',
    krc: '[59142,6213]<0,193,99>Then <193,255,99>it <448,353,99>pours <801,1812,99>out <2613,272,99>a <2885,704,99>page <3589,368,99>of <3957,432,99>rhythm <4389,400,99>and <4789,1424,99>rhyme',
    kwrc: '[00:59.142]<193,-193>Then <448,-62>it <801,95>pours <2613,-1011>out <2885,2341>a <3589,2181>page <3957,3221>of <4389,3525>rhythm <4789,3989>and <6213,3365>rhyme',
    yrc: '[59142,6213](59142,193,99)Then (59335,255,99)it (59590,353,99)pours (59943,1812,99)out (61755,272,99)a (62027,704,99)page (62731,368,99)of (63099,432,99)rhythm (63531,400,99)and (63931,1424,99)rhyme',
    ttml: '<p begin="59142ms" end="65355ms" xml:space="preserve"><span begin="59142ms" end="59335ms">Then </span><span begin="59335ms" end="59590ms">it </span><span begin="59590ms" end="59943ms">pours </span><span begin="59943ms" end="61755ms">out </span><span begin="61755ms" end="62027ms">a </span><span begin="62027ms" end="62731ms">page </span><span begin="62731ms" end="63099ms">of </span><span begin="63099ms" end="63531ms">rhythm </span><span begin="63531ms" end="63931ms">and </span><span begin="63931ms" end="65355ms">rhyme</span></p>',
  },
  {
    timestamp: '02:04.476',
    start: 124476,
    duration: 6016,
    text: "Let's go present her a bunch of daisy",
    translation: '我们给她献一捧雏菊吧',
    lrc: "[02:04.476]<0,369>Let's <369,415>go <784,897>present <1681,1151>her <2832,352>a <3184,976>bunch <4160,464>of <4624,1392>daisy",
    qrc: "[124476,6016]Let's (124476,369)go (124845,415)present (125260,897)her (126157,1151)a (127308,352)bunch (127660,976)of (128636,464)daisy(129100,1392)",
    krc: "[124476,6016]<0,369,99>Let's <369,415,99>go <784,897,99>present <1681,1151,99>her <2832,352,99>a <3184,976,99>bunch <4160,464,99>of <4624,1392,99>daisy",
    kwrc: "[02:04.476]<369,-369>Let's <784,-46>go <1681,-113>present <2832,530>her <3184,2480>a <4160,2208>bunch <4624,3696>of <6016,3232>daisy",
    yrc: "[124476,6016](124476,369,99)Let's (124845,415,99)go (125260,897,99)present (126157,1151,99)her (127308,352,99)a (127660,976,99)bunch (128636,464,99)of (129100,1392,99)daisy",
    ttml: '<p begin="124476ms" end="130492ms" xml:space="preserve"><span begin="124476ms" end="124845ms">Let&apos;s </span><span begin="124845ms" end="125260ms">go </span><span begin="125260ms" end="126157ms">present </span><span begin="126157ms" end="127308ms">her </span><span begin="127308ms" end="127660ms">a </span><span begin="127660ms" end="128636ms">bunch </span><span begin="128636ms" end="129100ms">of </span><span begin="129100ms" end="130492ms">daisy</span></p>',
  },
  {
    timestamp: '02:10.748',
    start: 130748,
    duration: 6496,
    text: 'Like grandpa once did and sing her a lullaby',
    translation: '就像爷爷那样给她唱首摇篮曲',
    lrc: '[02:10.748]<0,256>Like <256,1504>grandpa <1760,624>once <2384,896>did <3280,256>and <3536,448>sing <3984,320>her <4304,416>a <4720,1776>lullaby',
    qrc: '[130748,6496]Like (130748,256)grandpa (131004,1504)once (132508,624)did (133132,896)and (134028,256)sing (134284,448)her (134732,320)a (135052,416)lullaby(135468,1776)',
    krc: '[130748,6496]<0,256,99>Like <256,1504,99>grandpa <1760,624,99>once <2384,896,99>did <3280,256,99>and <3536,448,99>sing <3984,320,99>her <4304,416,99>a <4720,1776,99>lullaby',
    kwrc: '[02:10.748]<256,-256>Like <1760,-1248>grandpa <2384,1136>once <3280,1488>did <3536,3024>and <3984,3088>sing <4304,3664>her <4720,3888>a <6496,2944>lullaby',
    yrc: '[130748,6496](130748,256,99)Like (131004,1504,99)grandpa (132508,624,99)once (133132,896,99)did (134028,256,99)and (134284,448,99)sing (134732,320,99)her (135052,416,99)a (135468,1776,99)lullaby',
    ttml: '<p begin="130748ms" end="137244ms" xml:space="preserve"><span begin="130748ms" end="131004ms">Like </span><span begin="131004ms" end="132508ms">grandpa </span><span begin="132508ms" end="133132ms">once </span><span begin="133132ms" end="134028ms">did </span><span begin="134028ms" end="134284ms">and </span><span begin="134284ms" end="134732ms">sing </span><span begin="134732ms" end="135052ms">her </span><span begin="135052ms" end="135468ms">a </span><span begin="135468ms" end="137244ms">lullaby</span></p>',
  },
]

test('format detection and dispatch read selected corpus lines in all six formats repeatedly', () => {
  const cases = [
    ['lrc', samples.map((sample) => sample.lrc).join('\n')],
    ['qrc', samples.map((sample) => sample.qrc).join('\n')],
    ['krc', samples.map((sample) => sample.krc).join('\n')],
    ['kwrc', '[kuwo:13]\n' + samples.map((sample) => sample.kwrc).join('\n')],
    ['yrc', samples.map((sample) => sample.yrc).join('\n')],
    ['ttml', '<tt><body><div>' + samples.map((sample) => sample.ttml).join('') + '</div></body></tt>'],
  ] as const
  for (const [format, source] of cases) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      assert.equal(detectFormat(source), format)
      const result = parse(source)
      assert.ok(result)
      assert.equal(result.lyric.format, format)
      assert.equal(result.lyric.status, EnrichedLyricStatus.VALID)
      assert.deepEqual(
        result.lyric.lines.map((line) => getEnrichedLineContentText(line.content)),
        samples.map((sample) => sample.text),
      )
      assert.deepEqual(
        result.lyric.lines.map((line) => line.time?.start),
        samples.map((sample) => sample.start),
      )
      assert.deepEqual(result.diagnostics, validateEnrichedLyric(result.lyric))
    }
  }
})

test('format detection uses original corpus timing rather than auxiliary tracks', () => {
  const original = samples[0]!.lrc
  assert.equal(detectFormat({ original, translations: samples[1]!.yrc }), 'lrc')
  for (const input of [undefined, null, 42, [], {}, { original: 42 }, '', samples[0]!.text, { original: '', translations: original }]) {
    assert.equal(detectFormat(input), undefined)
    assert.equal(parse(input), null)
  }
})

test('known parsers reject corpus text after its timing syntax is removed', () => {
  const text = samples.map((sample) => sample.text).join('\n')
  for (const parser of [parseLrc, parseQrc, parseKrc, parseKwrc, parseYrc, parseTtml]) {
    const result = parser(text)
    assert.equal(result.lyric.status, EnrichedLyricStatus.INVALID)
    assert.deepEqual(result.lyric.lines, [])
    assert.deepEqual(result.diagnostics, validateEnrichedLyric(result.lyric))
  }
})

test('native parsers retain damaged corpus word ranges for model diagnostics', () => {
  const sample = samples[2]!
  const cases = [
    [parseQrc, sample.qrc],
    [parseKrc, sample.krc],
    [parseYrc, sample.yrc],
  ] as const
  for (const [parser, source] of cases) {
    const damaged = source.replace(/^\[\d+,\d+\]/u, `[${sample.start},100]`)
    const result = parser(damaged)
    assert.deepEqual(result.lyric.lines[0]?.time, { start: sample.start, end: sample.start + 100 })
    assert.equal(getEnrichedLineContentText(result.lyric.lines[0]?.content), sample.text)
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'line.word.time.uncovered'))
    assert.deepEqual(result.diagnostics, validateEnrichedLyric(result.lyric))
  }
})

test('QRC and KRC preserve corpus slots replaced with Unicode whitespace or a text BOM', () => {
  const first = samples[0]!
  const second = samples[1]!
  const cases = [
    [parseQrc, `[${first.start},500]\u0085(${first.start},500)\n[${second.start},500]\uFEFF${second.text}(${second.start},500)`],
    [parseKrc, `[${first.start},500]<0,500,0>\u0085\n[${second.start},500]<0,500,0>\uFEFF${second.text}`],
  ] as const
  for (const [parser, source] of cases) {
    const { lyric } = parser(source)
    assert.equal(lyric.lines[0]?.type, EnrichedLineType.INSTRUMENTAL)
    assert.deepEqual(lyric.lines[0]?.time, { start: first.start, end: first.start + 500 })
    assert.equal(lyric.lines[1]?.type, EnrichedLineType.NORMAL)
    assert.equal(getEnrichedLineContentText(lyric.lines[1]?.content), '\uFEFF' + second.text)
  }
})
