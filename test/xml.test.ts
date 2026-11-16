import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  XmlNodeType,
  createXmlCdata,
  createXmlElement,
  createXmlText,
  findXmlElement,
  findXmlElements,
  getXmlAttribute,
  getXmlChildElements,
  getXmlQualifiedAttribute,
  getXmlTextContent,
  parseXml,
  serializeXml,
} from '@root/utils/xml'

const samples = [
  {
    text: 'Gondola fying in the sky',
    translation: '在空中自在徜徉',
  },
  {
    text: 'Filling up my nose',
    translation: '咸涩的味道直冲鼻腔',
  },
  {
    text: 'Drifting notes like a gentle dream',
    translation: '跃动的音符如梦似幻',
  },
]

test('XML preserves corpus text, namespace names, mixed content, and document order', () => {
  const [first, second, third] = samples
  assert.ok(first && second && third)
  const document = parseXml(
    `<tt:p xmlns:tt="urn:lyrics" xml:id='line-1'>${first.text}<tt:span>${second.text}<tt:span>${third.text}</tt:span></tt:span>` +
      `<![CDATA[${first.translation}]]><tt:span/>${second.translation}</tt:p>`,
  )
  assert.ok(document)
  const paragraph = findXmlElement(document, 'p')
  assert.ok(paragraph)
  assert.equal(paragraph.qualifiedName, 'tt:p')
  assert.equal(paragraph.namespacePrefix, 'tt')
  assert.equal(getXmlAttribute(paragraph, 'id'), 'line-1')
  assert.equal(getXmlQualifiedAttribute(paragraph, 'xml:id'), 'line-1')
  assert.equal(getXmlQualifiedAttribute(paragraph, 'id'), undefined)
  assert.equal(getXmlTextContent(paragraph), first.text + second.text + third.text + first.translation + second.translation)
  assert.equal(getXmlChildElements(paragraph, 'span').length, 2)
  assert.deepEqual(findXmlElements(paragraph, 'span').map(getXmlTextContent), [second.text + third.text, third.text, ''])
})

test('XML decodes named and numeric references exactly once beside corpus text', () => {
  const sample = samples[0]!
  const encoded = `${sample.text}&lt;&gt;&amp;&quot;&apos;&#22312;&#x7A7A; &amp;lt;${sample.translation}`
  const document = parseXml(`<p value="${encoded}">${encoded}</p>`)
  assert.ok(document)
  const paragraph = findXmlElement(document, 'p')
  assert.ok(paragraph)
  const expected = `${sample.text}<>&"\'在空 &lt;${sample.translation}`
  assert.equal(getXmlAttribute(paragraph, 'value'), expected)
  assert.equal(getXmlTextContent(paragraph), expected)
})

test('XML preserves unknown entities and bare ampersands after corpus translations', () => {
  const sample = samples[1]!
  const suffix = '&amp; &custom; &#xZZ; &#-1; &#x110000; &#; &&&'
  const document = parseXml(`<p value="${sample.translation}${suffix}">${sample.text}${suffix}</p>`)
  assert.ok(document)
  const paragraph = findXmlElement(document, 'p')
  assert.ok(paragraph)
  const decoded = '& &custom; &#xZZ; &#-1; &#x110000; &#; &&&'
  assert.equal(getXmlTextContent(paragraph), sample.text + decoded)
  assert.equal(getXmlAttribute(paragraph, 'value'), sample.translation + decoded)
})

test('XML skips declarations and comments while preserving corpus CDATA literally', () => {
  const sample = samples[2]!
  const document = parseXml(
    '\uFEFF<?xml version="1.0"?><?processing ignored?><!DOCTYPE p [<!ENTITY custom "ignored">]>' +
      `<!--${sample.translation}--><p>${sample.text}<!--${sample.text}--><?processing ignored?>` +
      `<![CDATA[${sample.translation} &amp;]]>&custom;</p>`,
  )
  assert.ok(document)
  const paragraph = findXmlElement(document, 'p')
  assert.ok(paragraph)
  assert.equal(getXmlTextContent(paragraph), sample.text + sample.translation + ' &amp;&custom;')
  assert.deepEqual(
    paragraph.children.map((node) => node.nodeType),
    [XmlNodeType.text, XmlNodeType.cdata, XmlNodeType.text],
  )
})

test('XML rejects damaged tags, attributes, and markup containing corpus text', () => {
  const sample = samples[0]!
  const sources = [
    '',
    sample.text,
    '<p>',
    `<p>${sample.text}</span>`,
    `<p><span>${sample.translation}</p>`,
    `<p value=${sample.text}/>`,
    `<p value="${sample.translation}/>`,
    `<p value="${sample.text}" value="${sample.translation}"/>`,
    '<p / >',
    `<p>${sample.text}<`,
    `<!--${sample.translation}`,
    '<?xml version="1.0"',
    `<p><![CDATA[${sample.text}</p>`,
    '<!DOCTYPE p [',
  ]
  for (const source of sources) {
    assert.equal(parseXml(source), null, source)
  }
})

test('XML serialization escapes reserved characters and preserves whitespace around corpus text', () => {
  const sample = samples[1]!
  const attribute = `${sample.translation} & "${sample.text}" < >\t\n\r`
  const text = `${sample.text} & ${sample.translation} < >\r\n`
  const xml = serializeXml(createXmlElement('p', [['value', attribute]], [createXmlText(text)]), { declaration: false })
  assert.ok(xml.includes('&amp;'))
  assert.ok(xml.includes('&quot;'))
  assert.ok(xml.includes('&#9;&#10;&#13;'))
  const document = parseXml(xml)
  assert.ok(document)
  const paragraph = findXmlElement(document, 'p')
  assert.ok(paragraph)
  assert.equal(getXmlAttribute(paragraph, 'value'), attribute)
  assert.equal(getXmlTextContent(paragraph), text)
})

test('XML serialization replaces forbidden controls and unpaired surrogates appended to corpus text', () => {
  const text = `${samples[2]!.text}\u0000\u0001\uD800\uDC00\uD800${samples[2]!.translation}`
  const expected = `${samples[2]!.text}\uFFFD\uFFFD\uD800\uDC00\uFFFD${samples[2]!.translation}`
  const document = parseXml(serializeXml(createXmlElement('p', [['value', text]], [createXmlText(text)])))
  assert.ok(document)
  const paragraph = findXmlElement(document, 'p')
  assert.ok(paragraph)
  assert.equal(getXmlTextContent(paragraph), expected)
  assert.equal(getXmlAttribute(paragraph, 'value'), expected)
})

test('XML CDATA round-trips corpus lines separated by closing delimiters', () => {
  const text = samples.map((sample) => sample.text + sample.translation).join(']]>')
  const document = parseXml(serializeXml(createXmlElement('p', [], [createXmlCdata(text)])))
  assert.ok(document)
  assert.equal(getXmlTextContent(document), text)
})

test('XML indentation does not change mixed corpus content', () => {
  const paragraph = createXmlElement(
    'p',
    [],
    [createXmlText(samples[0]!.text), createXmlElement('span', [], [createXmlText(samples[1]!.translation)]), createXmlText(samples[2]!.text)],
  )
  for (const indent of [false, true]) {
    const document = parseXml(serializeXml(paragraph, { indent, indentText: '    ' }))
    assert.ok(document)
    const reparsed = findXmlElement(document, 'p')
    assert.ok(reparsed)
    assert.deepEqual(reparsed, paragraph)
    assert.equal(getXmlTextContent(reparsed), samples[0]!.text + samples[1]!.translation + samples[2]!.text)
  }
})
