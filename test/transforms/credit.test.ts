import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CreditRole, TimingLevel, getEnrichedLineContentText, makeEnrichedLineBackground, makeMeta } from '@gondola-lyrics/model'

import { extractCredits, parseLrc } from '@root/parser'

const credits = [
  { label: '词 Lyricist', name: 'TestWriter', original: '[00:01.130]<0,66>词<67,66> <133,66>Lyricist：<200,66>TestWriter' },
  { label: '曲 Composer', name: 'TestComposer', original: '[00:01.396]<0,66>曲<67,66> <133,66>Composer：<200,66>TestComposer' },
  { label: '编曲 Arranger', name: 'TestComposer', original: '[00:01.662]<0,66>编<67,66>曲<133,66> <200,66>Arranger：<266,66>TestComposer' },
  { label: '演唱Vocal by', name: 'Test Vocal', original: '[00:01.995]<0,66>演<66,66>唱<132,66>Vocal <199,66>by：<265,66>Test <332,66>Vocal' },
  {
    label: '弦乐编写Strings by',
    name: 'TestComposer',
    original: '[00:02.393]<0,66>弦<67,66>乐<133,66>编<200,66>写<266,66>Strings <333,66>by：<399,66>TestComposer',
  },
  {
    label: '木吉他演奏',
    name: '测试乐手',
    original: '[00:02.859]<0,66>木<66,66>吉<133,66>他<199,66>演<266,66>奏<332,66>：<399,66>测<465,66>试<532,66>乐<598,66>手',
  },
  {
    label: '混音师 Mixing Engineer',
    name: '测试员@Test Studio',
    original:
      '[00:03.524]<0,66>混<66,66>音<133,66>师<199,66> <266,66>Mixing <332,66>Engineer：<399,66>测<465,66>试<532,66>员<598,66>@<664,66>Test <731,66>Studio',
  },
  {
    label: '母带工程师 Mastering Engineer',
    name: '测试员@Test Studio',
    original:
      '[00:04.321]<0,66>母<67,66>带<133,66>工<200,66>程<266,66>师<333,66> <399,66>Mastering <466,66>Engineer：<532,66>测<599,66>试<665,66>员<732,66>@<798,66>Test <865,66>Studio',
  },
  {
    label: '录音棚 Studio',
    name: '测试专用虚拟录音棚',
    original:
      '[00:05.252]<0,66>录<67,66>音<133,66>棚<200,66> <266,66>Studio：<333,66>测<399,66>试<466,66>专<532,66>用<599,66>虚<665,66>拟<732,66>录<798,66>音<865,66>棚',
  },
  {
    label: '录音师 Recording Engineer',
    name: 'Test Vocal',
    original: '[00:06.183]<0,66>录<66,66>音<133,66>师<199,66> <266,66>Recording <332,66>Engineer：<399,66>Test <465,66>Vocal',
  },
  {
    label: '监制 Recording Supervisor',
    name: 'TestComposer',
    original: '[00:06.715]<0,66>监<66,66>制<133,66> <199,66>Recording <266,66>Supervisor：<332,66>TestComposer',
  },
  { label: '助理Assistant', name: 'Test助手', original: '[00:07.114]<0,66>助<66,66>理<133,66>Assistant：<199,66>Test<266,66>助<332,66>手' },
  {
    label: '出品 Produced by',
    name: '测试制作团队',
    original: '[00:07.513]<0,66>出<66,66>品<133,66> <199,66>Produced <266,18>by：<284,18>测<303,18>试<322,18>制<341,18>作<360,18>团<379,18>队',
  },
]

test('credit extraction recognizes supported corpus labels and retains unsupported complete labels and names', () => {
  const body = {
    timestamp: '00:07.911',
    start: 7911,
    duration: 4756,
    text: 'I can see the dawn on water’s face',
    translation: '我能看到晨曦倒映在水面上',
    lrc: '[00:07.911]<0,192>I <192,272>can <464,560>see <1024,432>the <1456,816>dawn <2272,176>on <2448,272>water’<2720,192>s <2912,1844>face',
    line: '[00:07.911]I can see the dawn on water’s face',
  }
  const roles = [
    CreditRole.LYRICIST,
    CreditRole.COMPOSER,
    CreditRole.ARRANGER,
    null,
    null,
    null,
    CreditRole.MIXING_ENGINEER,
    CreditRole.MASTERING_ENGINEER,
    null,
    CreditRole.OTHER,
    null,
    CreditRole.OTHER,
    CreditRole.PRODUCER,
  ]

  for (const [index, credit] of credits.entries()) {
    const { lyric } = parseLrc({
      original: `${credit.original}\n${body.lrc}`,
      translations: `[${body.timestamp}]${body.translation}`,
    })
    const result = extractCredits(lyric)
    const role = roles[index]

    assert.equal(result.lines, lyric.lines)
    assert.equal(getEnrichedLineContentText(result.lines[0]?.content), `${credit.label}：${credit.name}`)
    assert.equal(getEnrichedLineContentText(result.lines[1]?.content), body.text)
    assert.equal(result.lines[1]?.annotation?.translations[0]?.text, body.translation)

    if (role === null) {
      assert.equal(result, lyric)
      assert.equal(extractCredits(lyric, { removeSourceLines: true }), lyric)
    } else {
      assert.deepEqual(
        result.meta?.credits.map((entry) => {
          return { raw: entry.raw, role: entry.role, names: entry.names.map((name) => name.text) }
        }),
        [{ raw: credit.label, role, names: [credit.name] }],
      )
    }
  }
})

test('credit source removal drops attached corpus content without moving it or mutating the source', () => {
  const credit = {
    label: '混音师 Mixing Engineer',
    name: '测试员@Test Studio',
    original:
      '[00:03.524]<0,66>混<66,66>音<133,66>师<199,66> <266,66>Mixing <332,66>Engineer：<399,66>测<465,66>试<532,66>员<598,66>@<664,66>Test <731,66>Studio',
  }
  const body = {
    timestamp: '00:27.320',
    start: 27320,
    duration: 4848,
    text: 'Each mark I make a trace beneath',
    translation: '每一笔 都是我人生足迹',
    lrc: '[00:27.320]<0,337>Each <337,367>mark <704,304>I <1008,416>make <1424,337>a <1761,575>trace <2336,2512>beneath',
    line: '[00:27.320]Each mark I make a trace beneath',
  }
  const background = {
    timestamp: '00:07.911',
    start: 7911,
    duration: 4756,
    text: 'I can see the dawn on water’s face',
    translation: '我能看到晨曦倒映在水面上',
    lrc: '[00:07.911]<0,192>I <192,272>can <464,560>see <1024,432>the <1456,816>dawn <2272,176>on <2448,272>water’<2720,192>s <2912,1844>face',
    line: '[00:07.911]I can see the dawn on water’s face',
  }
  const { lyric } = parseLrc({
    original: `${credit.original}\n${body.line}`,
    translations: `[${body.timestamp}]${body.translation}`,
  })
  const backgroundLine = parseLrc({
    original: background.lrc,
    translations: `[${background.timestamp}]${background.translation}`,
  }).lyric.lines[0]
  const first = lyric.lines[0]
  assert.ok(first)
  assert.ok(backgroundLine)
  first.annotation = backgroundLine.annotation
  first.backgrounds = [
    makeEnrichedLineBackground({ time: backgroundLine.time, content: backgroundLine.content, annotation: backgroundLine.annotation }),
  ]
  const original = structuredClone(lyric)

  const result = extractCredits(lyric, { removeSourceLines: true })
  assert.deepEqual(result.lines, [lyric.lines[1]])
  assert.equal(result.lines[0], lyric.lines[1])
  assert.equal(getEnrichedLineContentText(result.lines[0]?.content), body.text)
  assert.equal(result.lines[0]?.annotation?.translations[0]?.text, body.translation)
  assert.deepEqual(result.lines[0]?.backgrounds, [])
  assert.equal(result.timing, TimingLevel.LINE)
  assert.deepEqual(
    result.meta?.credits.map((entry) => {
      return { raw: entry.raw, role: entry.role, names: entry.names.map((name) => name.text) }
    }),
    [{ raw: credit.label, role: CreditRole.MIXING_ENGINEER, names: [credit.name] }],
  )
  assert.equal(extractCredits(result, { removeSourceLines: true }), result)
  assert.deepEqual(lyric, original)
})

test('credit extraction consumes readable corpus metadata only when enabled and preserves unmatched or empty values', () => {
  const body = {
    timestamp: '01:37.858',
    start: 97858,
    duration: 6320,
    text: "It's so surreal when salty air was blowing",
    translation: '感觉如此梦幻 咸咸的海风拂面吹过  ',
    lrc: "[01:37.858]<0,272>It's <272,736>so <1008,2321>surreal <3329,287>when <3616,512>salty <4128,656>air <4784,464>was <5248,1072>blowing",
    line: "[01:37.858]It's so surreal when salty air was blowing",
  }
  const lyricist = { label: '词 Lyricist', name: 'TestWriter', original: '[00:01.130]<0,66>词<67,66> <133,66>Lyricist：<200,66>TestWriter' }
  const mixer = {
    label: '混音师 Mixing Engineer',
    name: '测试员@Test Studio',
    original:
      '[00:03.524]<0,66>混<66,66>音<133,66>师<199,66> <266,66>Mixing <332,66>Engineer：<399,66>测<465,66>试<532,66>员<598,66>@<664,66>Test <731,66>Studio',
  }
  const composer = { label: '曲 Composer', name: 'TestComposer', original: '[00:01.396]<0,66>曲<67,66> <133,66>Composer：<200,66>TestComposer' }
  const supervisor = {
    label: '监制 Recording Supervisor',
    name: 'TestComposer',
    original: '[00:06.715]<0,66>监<66,66>制<133,66> <199,66>Recording <266,66>Supervisor：<332,66>TestComposer',
  }
  const studio = {
    label: '录音棚 Studio',
    name: '测试专用虚拟录音棚',
    original:
      '[00:05.252]<0,66>录<67,66>音<133,66>棚<200,66> <266,66>Studio：<333,66>测<399,66>试<466,66>专<532,66>用<599,66>虚<665,66>拟<732,66>录<798,66>音<865,66>棚',
  }
  const parsed = parseLrc({ original: body.lrc, translations: `[${body.timestamp}]${body.translation}` }).lyric
  const unknowns = [
    { key: lyricist.label, value: `${lyricist.name}/${lyricist.name}` },
    { key: mixer.label, value: mixer.name },
    { key: composer.label, value: '  ' },
    { key: supervisor.label, value: supervisor.name },
    { key: studio.label, value: studio.name },
  ]
  const lyric = { ...parsed, meta: makeMeta({ unknowns }) }
  const original = structuredClone(lyric)
  assert.equal(extractCredits(lyric), lyric)

  const result = extractCredits(lyric, { matchUnknowns: true })
  assert.equal(result.lines, lyric.lines)
  assert.deepEqual(result.meta?.unknowns, unknowns.slice(2))
  assert.deepEqual(
    result.meta?.credits.map((entry) => {
      return { raw: entry.raw, role: entry.role, names: entry.names.map((name) => name.text) }
    }),
    [
      { raw: lyricist.label, role: CreditRole.LYRICIST, names: [lyricist.name] },
      { raw: mixer.label, role: CreditRole.MIXING_ENGINEER, names: [mixer.name] },
    ],
  )
  assert.equal(extractCredits(result, { matchUnknowns: true }), result)
  assert.deepEqual(lyric, original)
})
