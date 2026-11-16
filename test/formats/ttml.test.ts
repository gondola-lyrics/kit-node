import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EnrichedLyricStatus, EnrichedWordType, TimingLevel, getEnrichedLineContentText } from '@gondola-lyrics/model'

import { generateTtml } from '@root/generator'
import { detectFormat, parseTtml } from '@root/parser'

const samples = [
  {
    timestamp: '00:51.771',
    start: 51771,
    duration: 7221,
    text: 'When time is fluid like red wine in my bottle',
    translation: '时光如佳酿 缓缓流淌',
    ttml: '<p begin="51771ms" end="58992ms" xml:space="preserve"><span begin="51771ms" end="52012ms">When </span><span begin="52012ms" end="52763ms">time </span><span begin="52763ms" end="53020ms">is </span><span begin="53020ms" end="55291ms">fluid </span><span begin="55291ms" end="55563ms">like </span><span begin="55563ms" end="55899ms">red </span><span begin="55899ms" end="56219ms">wine </span><span begin="56219ms" end="56587ms">in </span><span begin="56587ms" end="57100ms">my </span><span begin="57100ms" end="58992ms">bottle</span></p>',
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
    timestamp: '01:10.892',
    start: 70892,
    duration: 3985,
    text: 'To the rainbows arching up high',
    translation: '朝着彩虹之巅的方向',
    ttml: '<p begin="70892ms" end="74877ms" xml:space="preserve"><span begin="70892ms" end="71277ms">To </span><span begin="71277ms" end="71709ms">the </span><span begin="71709ms" end="72717ms">rainbows </span><span begin="72717ms" end="73597ms">arching </span><span begin="73597ms" end="74445ms">up </span><span begin="74445ms" end="74877ms">high</span></p>',
    words: [
      { type: EnrichedWordType.NORMAL, text: 'To', time: { start: 70892, end: 71277 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'the', time: { start: 71277, end: 71709 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'rainbows', time: { start: 71709, end: 72717 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'arching', time: { start: 72717, end: 73597 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'up', time: { start: 73597, end: 74445 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'high', time: { start: 74445, end: 74877 } },
    ],
  },
  {
    timestamp: '01:14.914',
    start: 74914,
    duration: 2992,
    text: 'Gondola fying in the sky',
    translation: '在空中自在徜徉',
    ttml: '<p begin="74914ms" end="77906ms" xml:space="preserve"><span begin="74914ms" end="75970ms">Gondola </span><span begin="75970ms" end="76482ms">fying </span><span begin="76482ms" end="76834ms">in </span><span begin="76834ms" end="77122ms">the </span><span begin="77122ms" end="77906ms">sky</span></p>',
    words: [
      { type: EnrichedWordType.NORMAL, text: 'Gondola', time: { start: 74914, end: 75970 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'fying', time: { start: 75970, end: 76482 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'in', time: { start: 76482, end: 76834 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'the', time: { start: 76834, end: 77122 } },
      { type: EnrichedWordType.SPACE, text: ' ', time: undefined },
      { type: EnrichedWordType.NORMAL, text: 'sky', time: { start: 77122, end: 77906 } },
    ],
  },
]

test('TTML reads prefixed corpus paragraphs with namespace aliases and mixed time units', () => {
  const sample = samples[0]!
  const source =
    '<tt:tt xmlns:tt="http://www.w3.org/ns/ttml" xmlns:a="http://www.example.com/ns/amll" xml:lang="EN">' +
    `<tt:body><tt:div><tt:p begin="51.771s" end="58992ms">${sample.text}</tt:p></tt:div></tt:body></tt:tt>`
  assert.equal(detectFormat(source), 'ttml')
  const { lyric, diagnostics } = parseTtml(source, { language: 'zh-hans' })
  assert.equal(lyric.profile, 'amll')
  assert.equal(lyric.meta?.language, 'en')
  assert.deepEqual(lyric.lines[0]?.time, { start: 51771, end: 58992 })
  assert.equal(lyric.lines[0]?.content?.text, sample.text)
  assert.deepEqual(diagnostics, [])
})

test('TTML profile detection follows bindings without treating corpus text as metadata', () => {
  const sample = samples[1]!
  const cases = [
    ['<tt>', '', ''],
    ['<tt xmlns:i="http://itunes.apple.com/lyric-ttml-extensions">', '', 'itunes'],
    ['<tt>', '<head><metadata><iTunesMetadata xmlns="http://music.apple.com/lyric-ttml-internal"/></metadata></head>', 'itunes'],
    ['<tt xmlns:i="http://itunes.apple.com/lyric-ttml-extensions" xmlns:a="http://www.example.com/ns/amll">', '', 'amll'],
    ['<tt xmlns:a="urn:other">', `<head><metadata><a:meta key="musicName" value="${sample.text}"/></metadata></head>`, ''],
  ] as const
  for (const [root, head, profile] of cases) {
    const { lyric } = parseTtml(`${root}${head}<body>${sample.ttml}</body></tt>`)
    assert.equal(lyric.status, EnrichedLyricStatus.VALID)
    assert.equal(lyric.profile, profile)
  }
})

test('TTML preserves corpus word spaces and xml:space while removing formatting indentation', () => {
  const first = samples[1]!
  const second = samples[2]!
  const paragraph = first.ttml.replaceAll('><span', '>\n<span').replace('</p>', '\n</p>').replace(' xml:space="preserve"', '')
  const source = `<tt><body>${paragraph}<p begin="${second.start}ms" end="${second.start + second.duration}ms" xml:space="preserve">  ${second.translation}  </p></body></tt>`
  const { lyric, diagnostics } = parseTtml(source)
  assert.equal(lyric.timing, TimingLevel.WORD)
  assert.deepEqual(
    lyric.lines[0]?.content?.words.map(({ type, text, time }) => ({ type, text, time })),
    first.words,
  )
  assert.equal(lyric.lines[1]?.content?.text, `  ${second.translation}  `)
  assert.deepEqual(diagnostics, [])
})

test('TTML separates corpus translations, Latin annotations, and timed backgrounds from the lead', () => {
  const first = samples[0]!
  const second = samples[1]!
  const content = first.ttml
    .replace(`end="${first.start + first.duration}ms"`, `end="${second.start + second.duration}ms"`)
    .replace(
      '</p>',
      `<span ttm:role="x-translation" xml:lang="ZH-HANS">${first.translation}</span>` +
        `<span ttm:role="x-roman" xml:lang="EN">${first.text}</span>` +
        `<span ttm:role="x-bg"><span begin="${second.start}ms" end="${second.start + second.duration}ms">${second.text}</span></span></p>`,
    )
  const { lyric, diagnostics } = parseTtml(`<tt xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><body>${content}</body></tt>`)
  const line = lyric.lines[0]
  assert.ok(line)
  assert.equal(getEnrichedLineContentText(line.content), first.text)
  assert.equal(line.annotation?.translations[0]?.text, first.translation)
  assert.equal(line.annotation?.translations[0]?.language, 'zh-hans')
  assert.equal(line.annotation?.romans[0]?.content?.text, first.text)
  assert.deepEqual(line.backgrounds[0]?.time, { start: second.start, end: second.start + second.duration })
  assert.equal(getEnrichedLineContentText(line.backgrounds[0]?.content), second.text)
  assert.deepEqual(diagnostics, [])
})

test('TTML ruby uses paired corpus text and translation while inferring its word bounds', () => {
  const sample = samples[2]!
  const end = sample.start + sample.duration
  const source =
    '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling"><body>' +
    `<p begin="${sample.start}ms" end="${end}ms"><span tts:ruby="container"><span tts:ruby="base">${sample.translation}</span>` +
    `<span tts:ruby="textContainer"><span tts:ruby="text" begin="${sample.start}ms" end="${end}ms">${sample.text}</span></span></span></p></body></tt>`
  const { lyric, diagnostics } = parseTtml(source)
  const word = lyric.lines[0]?.content?.words[0]
  assert.ok(word)
  assert.equal(word.text, sample.translation)
  assert.deepEqual(word.time, { start: sample.start, end })
  assert.equal(word.annotation?.rubies[0]?.tokens[0]?.text, sample.text)
  assert.deepEqual(word.annotation?.rubies[0]?.tokens[0]?.time, word.time)
  assert.deepEqual(diagnostics, [])
})

test('TTML rejects malformed corpus containers and readable paragraphs without timing', () => {
  const sample = samples[1]!
  const broken = `<tt><body><p begin="${sample.start}ms">${sample.text}</body></tt>`
  for (const source of [broken, '<other/>', '<tt/><tt/>', sample.text + '<tt/>', `<![CDATA[${sample.translation}]]><tt/>`]) {
    assert.equal(detectFormat(source), undefined)
  }
  const untimed = `<tt><body><p>${sample.text}</p></body></tt>`
  for (const source of [broken, untimed]) {
    const { lyric } = parseTtml(source)
    assert.equal(lyric.status, EnrichedLyricStatus.INVALID)
    assert.deepEqual(lyric.lines, [])
  }
  assert.equal(detectFormat(untimed), 'ttml')
})

test('TTML generation round-trips corpus words and lead and background annotations in both profiles', () => {
  const first = samples[0]!
  const second = samples[1]!
  const content = first.ttml
    .replace(`end="${first.start + first.duration}ms"`, `end="${second.start + second.duration}ms"`)
    .replace(
      '</p>',
      `<span ttm:role="x-translation" xml:lang="zh-hans">${first.translation}</span>` +
        `<span ttm:role="x-roman" xml:lang="en">${first.text}</span>` +
        `<span ttm:role="x-bg"><span begin="${second.start}ms" end="${second.start + second.duration}ms">${second.text}</span>` +
        `<span ttm:role="x-translation" xml:lang="zh-hans">${second.translation}</span></span></p>`,
    )
  const original = parseTtml(`<tt xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><body>${content}</body></tt>`).lyric
  const sourceLine = original.lines[0]
  assert.ok(sourceLine)
  for (const profile of ['amll', 'itunes'] as const) {
    const generated = generateTtml(original, { profile, indent: true })
    assert.equal(detectFormat(generated), 'ttml')
    const { lyric, diagnostics } = parseTtml(generated)
    const line = lyric.lines[0]
    assert.ok(line)
    assert.equal(lyric.profile, profile)
    assert.deepEqual(line.time, sourceLine.time)
    assert.deepEqual(line.content, sourceLine.content)
    assert.deepEqual(line.annotation, sourceLine.annotation)
    assert.deepEqual(line.backgrounds[0]?.time, sourceLine.backgrounds[0]?.time)
    assert.deepEqual(line.backgrounds[0]?.content, sourceLine.backgrounds[0]?.content)
    assert.deepEqual(line.backgrounds[0]?.annotation, sourceLine.backgrounds[0]?.annotation)
    assert.deepEqual(diagnostics, [])
  }
})
