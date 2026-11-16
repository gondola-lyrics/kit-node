import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AgentType, getEnrichedLineContentText, makeAgent, makeText } from '@gondola-lyrics/model'

import { extractAgents, parseLrc } from '@root/parser'

const samples = [
  {
    timestamp: '02:00.912',
    start: 120912,
    duration: 3024,
    text: 'Where grandma resting her smile',
    translation: '在那里 奶奶笑容安详',
    lrc: '[02:00.912]<0,321>Where <321,1295>grandma <1616,368>resting <1984,448>her <2432,592>smile',
  },
  {
    timestamp: '02:31.022',
    start: 151022,
    duration: 2609,
    text: "Grandpa's holding me",
    translation: '爷爷抱着我',
    lrc: "[02:31.022]<0,576>Grandpa's <576,977>holding <1553,1056>me",
  },
  {
    timestamp: '02:58.550',
    start: 178550,
    duration: 9649,
    text: 'I wish you are still by my side',
    translation: '多希望你就在我身旁',
    lrc: '[02:58.550]<0,1648>I <1648,1488>wish <3136,2369>you <5505,223>are <5728,336>still <6064,352>by <6416,752>my <7168,2481>side',
  },
]

test('agent bindings propagate through corpus lines and reset at unmatched prefixes or instrumental rows', () => {
  const first = samples[0]!
  const second = samples[1]!
  const third = samples[2]!
  const source =
    `[${first.timestamp}]Test Vocal：${first.text}\n[${first.start + first.duration}ms]${first.translation}\n` +
    `[${second.timestamp}]TestComposer：${second.text}\n[${second.start + second.duration}ms]${second.translation}\n` +
    `[${third.timestamp}]Test Vocal：${third.text}\n[${third.start + third.duration}ms]\n[${third.start + third.duration + 1}ms]${third.translation}`
  const { lyric } = parseLrc(source)
  lyric.agents = [makeAgent({ id: 'v1', type: AgentType.PERSON, names: [makeText({ text: 'Test Vocal' })] })]
  const original = structuredClone(lyric)
  const result = extractAgents(lyric, { bindings: { 'Test Vocal': 'v1' } })
  assert.deepEqual(
    result.lines.map((line) => getEnrichedLineContentText(line.content)),
    [first.text, first.translation, 'TestComposer：' + second.text, second.translation, third.text, '', third.translation],
  )
  assert.deepEqual(
    result.lines.map((line) => line.agentIds),
    [['v1'], ['v1'], [], [], ['v1'], [], []],
  )
  assert.equal(result.lines[2], lyric.lines[2])
  assert.equal(result.lines[6], lyric.lines[6])
  assert.deepEqual(lyric, original)
})

test('agent inference ignores corpus clock colons and preserves word timing after prefix removal', () => {
  const { lyric } = parseLrc({
    original:
      "[02:00.912]02:00 Where grandma resting her smile\n[02:31.022]<0,576>Test Vocal：<576,977>Grandpa's <1553,1056>holding\n[02:58.550]I wish you are still by my side",
    romans: "[02:31.022]<0,576>Test Vocal<576,977>Grandpa's <1553,1056>holding",
  })
  const original = structuredClone(lyric)
  const retained = lyric.lines[1]?.content?.words.filter((word) => word.text === "Grandpa's")[0]
  assert.ok(retained?.annotation)
  const result = extractAgents(lyric)
  const agent = result.agents[0]
  assert.ok(agent)
  assert.equal(result.agents.length, 1)
  assert.equal(agent.names[0]?.text, 'Test Vocal')
  assert.equal(result.lines[0], lyric.lines[0])
  assert.ok(result.lines[1]?.content?.words.includes(retained))
  assert.deepEqual(retained.time, { start: 151598, end: 152575 })
  assert.deepEqual(result.lines[1]?.time, lyric.lines[1]?.time)
  assert.deepEqual(result.lines[1]?.agentIds, [agent.id])
  assert.deepEqual(result.lines[2]?.agentIds, [agent.id])
  assert.deepEqual(lyric, original)
})

test('agent extraction rejects absent binding targets and supports disabling corpus prefix inference', () => {
  const { lyric } = parseLrc('[02:58.550]Test Vocal：I wish you are still by my side')
  assert.throws(() => extractAgents(lyric, { bindings: { 'Test Vocal': 'missing' } }), TypeError)
  assert.equal(extractAgents(lyric, { bindings: {} }), lyric)
})
