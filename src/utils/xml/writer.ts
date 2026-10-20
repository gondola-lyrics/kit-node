import type { XmlElement, XmlNode } from './utils'

import { XmlNodeType } from './utils'

const AMPERSAND = 0x26
const LESS_THAN = 0x3c
const GREATER_THAN = 0x3e
const DOUBLE_QUOTE = 0x22
const TAB = 0x09
const LINE_FEED = 0x0a
const CARRIAGE_RETURN = 0x0d

const ROOT_NAME = '#document'

const REPLACEMENT_CHARACTER = '�'

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>'

const DEFAULT_INDENT = '  '

export interface XmlWriteOptions {
  /** Emit the XML declaration; defaults to `true`. */
  declaration?: boolean
  /**
   * Indent elements by nesting depth; defaults to `false`.
   *
   * The inserted whitespace becomes text when the output is parsed again.
   * Turn this on only for output no one reads back as lyrics.
   */
  indent?: boolean
  /** One indentation level; defaults to two spaces. */
  indentText?: string
}

/**
 * Reports whether a code point may appear in an XML 1.0 document.
 */
const isAllowedCodePoint = (code: number): boolean => {
  return (
    code === TAB ||
    code === LINE_FEED ||
    code === CARRIAGE_RETURN ||
    (code >= 0x20 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) ||
    (code >= 0x10000 && code <= 0x10ffff)
  )
}

/**
 * Escapes text content, replacing characters XML cannot carry so corruption stays visible.
 */
const escapeXmlText = (text: string, chunks: string[]): void => {
  const length = text.length
  let start = 0

  for (let index = 0; index < length; index += 1) {
    const code = text.charCodeAt(index)
    let escaped = ''

    if (code === AMPERSAND) {
      escaped = '&amp;'
    } else if (code === LESS_THAN) {
      escaped = '&lt;'
    } else if (code === GREATER_THAN) {
      escaped = '&gt;'
    } else if (code === CARRIAGE_RETURN) {
      // A parser folds a bare carriage return into a line feed, so the reference is the only way to keep it.
      escaped = '&#13;'
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const low = index + 1 < length ? text.charCodeAt(index + 1) : 0
      if (low < 0xdc00 || low > 0xdfff) {
        escaped = REPLACEMENT_CHARACTER
      } else {
        // A paired surrogate is one code point, which the loop advances over next.
        index += 1
        continue
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      escaped = REPLACEMENT_CHARACTER
    } else if (!isAllowedCodePoint(code)) {
      escaped = REPLACEMENT_CHARACTER
    }

    if (escaped === '') {
      continue
    }

    if (start < index) {
      chunks.push(text.slice(start, index))
    }
    chunks.push(escaped)
    start = index + 1
  }

  if (start === 0) {
    chunks.push(text)
    return
  }
  if (start < length) {
    chunks.push(text.slice(start))
  }
}

/**
 * Escapes an attribute value, where whitespace also has to survive normalization.
 */
const escapeXmlAttribute = (value: string, chunks: string[]): void => {
  const length = value.length
  let start = 0

  for (let index = 0; index < length; index += 1) {
    const code = value.charCodeAt(index)
    let escaped = ''

    if (code === AMPERSAND) {
      escaped = '&amp;'
    } else if (code === LESS_THAN) {
      escaped = '&lt;'
    } else if (code === GREATER_THAN) {
      escaped = '&gt;'
    } else if (code === DOUBLE_QUOTE) {
      escaped = '&quot;'
    } else if (code === TAB) {
      escaped = '&#9;'
    } else if (code === LINE_FEED) {
      escaped = '&#10;'
    } else if (code === CARRIAGE_RETURN) {
      escaped = '&#13;'
    } else if (!isAllowedCodePoint(code)) {
      escaped = REPLACEMENT_CHARACTER
    }

    if (escaped === '') {
      continue
    }

    if (start < index) {
      chunks.push(value.slice(start, index))
    }
    chunks.push(escaped)
    start = index + 1
  }

  if (start === 0) {
    chunks.push(value)
    return
  }
  if (start < length) {
    chunks.push(value.slice(start))
  }
}

/**
 * Reports whether every child is an element, which is the only case indentation can add whitespace to.
 *
 * An element holding any character data is mixed content, where the inserted whitespace would join the text.
 */
const hasOnlyElements = (element: XmlElement): boolean => {
  const children = element.children

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]
    if (child !== undefined && child.nodeType !== XmlNodeType.element) {
      return false
    }
  }

  return true
}

/**
 * Serializes one node, appending its pieces to `chunks`.
 */
const writeXmlNode = (node: XmlNode, chunks: string[], depth: number, indent: string | undefined) => {
  if (node.nodeType === XmlNodeType.text) {
    escapeXmlText(node.text, chunks)
    return
  }

  if (node.nodeType === XmlNodeType.cdata) {
    // A `]]>` inside the data would close the section early, so it is split across two sections.
    chunks.push('<![CDATA[', node.text.replaceAll(']]>', ']]]]><![CDATA[>'), ']]>')
    return
  }

  if (indent !== undefined && depth > 0) {
    chunks.push('\n', indent.repeat(depth))
  }

  chunks.push('<', node.qualifiedName)
  for (let index = 0; index < node.attributes.length; index += 1) {
    const attribute = node.attributes[index]
    if (attribute === undefined) {
      continue
    }
    chunks.push(' ', attribute.qualifiedName, '="')
    escapeXmlAttribute(attribute.value, chunks)
    chunks.push('"')
  }

  const children = node.children
  if (children.length === 0) {
    chunks.push('/>')
    return
  }

  chunks.push('>')
  // Mixed content keeps its children flush, since any whitespace here would join the text.
  const childIndent = indent !== undefined && hasOnlyElements(node) ? indent : undefined
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]
    if (child !== undefined) {
      writeXmlNode(child, chunks, depth + 1, childIndent)
    }
  }

  if (childIndent !== undefined) {
    chunks.push('\n', childIndent.repeat(depth))
  }
  chunks.push('</', node.qualifiedName, '>')
}

/**
 * Writes a tree back to text.
 *
 * A `#document` root, as `parseXml` returns, writes its children; any other root writes itself.
 */
export const serializeXml = (root: XmlElement, options: XmlWriteOptions = {}): string => {
  const chunks: string[] = []

  if (options.declaration ?? true) {
    chunks.push(XML_DECLARATION)
  }

  const indent = options.indent === true ? (options.indentText ?? DEFAULT_INDENT) : undefined
  if (indent !== undefined) {
    chunks.push('\n')
  }

  if (root.qualifiedName === ROOT_NAME) {
    for (let index = 0; index < root.children.length; index += 1) {
      const child = root.children[index]
      if (child !== undefined) {
        writeXmlNode(child, chunks, 0, indent)
      }
    }
  } else {
    writeXmlNode(root, chunks, 0, indent)
  }

  return chunks.join('')
}
