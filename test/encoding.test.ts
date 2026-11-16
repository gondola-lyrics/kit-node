import assert from 'node:assert/strict'
import { test } from 'node:test'

import { decodeBase64AsText } from '@root/utils/encoding'

const samples = [
  {
    text: 'Then it pours out a page of rhythm and rhyme',
    translation: '倾泻而下 奏响自然乐章',
  },
  {
    text: 'Like the first time tangled by the fishing line',
    translation: '就像第一次被渔线缠住那样',
  },
  {
    text: 'Where grandma resting her smile',
    translation: '在那里 奶奶笑容安详',
  },
]

test('base64 decodes padded and unpadded corpus lines without changing text', () => {
  for (const sample of samples) {
    for (const text of [sample.text, sample.translation, `${sample.text}\u0000${sample.translation}`]) {
      const encoded = Buffer.from(text).toString('base64')
      assert.equal(decodeBase64AsText(encoded), text)
      assert.equal(decodeBase64AsText(encoded.replace(/=+$/u, '')), text)
    }
  }
})

test('base64 decodes corpus translations as UTF-8 rather than byte strings', () => {
  const text = samples.map((sample) => sample.translation).join('\n')
  assert.equal(decodeBase64AsText(Buffer.from(text).toString('base64')), text)
})

test('base64 removes a leading BOM and preserves BOMs inside corpus text', () => {
  const text = samples[0]!.text
  assert.equal(decodeBase64AsText(Buffer.from(`\uFEFF${text}`).toString('base64')), text)
  assert.equal(
    decodeBase64AsText(Buffer.from(`${text}\uFEFF${samples[1]!.translation}`).toString('base64')),
    `${text}\uFEFF${samples[1]!.translation}`,
  )
  assert.equal(decodeBase64AsText('77u/'), '')
})

test('base64 rejects malformed padding, noncanonical bits, and whitespace around encoded corpus text', () => {
  const encoded = Buffer.from(samples[2]!.translation).toString('base64')
  const padded = Buffer.from(samples[0]!.text.slice(0, 1)).toString('base64')
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const noncanonical = padded[0]! + alphabet[alphabet.indexOf(padded[1]!) + 1]! + '=='
  const sources = [
    '',
    'Z',
    `${encoded}$`,
    `${encoded}===`,
    ` ${encoded}`,
    `${encoded}\n`,
    `${encoded}\u00A0`,
    `=${encoded}`,
    noncanonical,
    '_w==',
    '-w==',
  ]

  for (const source of sources) {
    assert.equal(decodeBase64AsText(source), null, JSON.stringify(source))
  }
})

test('base64 rejects malformed UTF-8 appended to otherwise valid corpus text', () => {
  const prefix = Buffer.from(samples[1]!.text)
  for (const bytes of [[0xff], [0x80], [0xc2], [0xc0, 0xaf], [0xe2, 0x82], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80]]) {
    const encoded = Buffer.concat([prefix, Buffer.from(bytes)]).toString('base64')
    assert.equal(decodeBase64AsText(encoded), null)
  }
})
