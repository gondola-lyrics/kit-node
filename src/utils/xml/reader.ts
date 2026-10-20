import type { XmlAttribute, XmlElement } from './utils'

import { applyXmlNameParts, createXmlAttribute, XmlNodeType } from './utils'

const LESS_THAN = 0x3c
const GREATER_THAN = 0x3e
const SLASH = 0x2f
const EQUALS = 0x3d
const DOUBLE_QUOTE = 0x22
const SINGLE_QUOTE = 0x27
const EXCLAMATION = 0x21
const QUESTION = 0x3f
const AMPERSAND = 0x26
const HASH = 0x23
const HYPHEN = 0x2d
const LOWER_X = 0x78
const UPPER_X = 0x58
const BYTE_ORDER_MARK = 0xfeff

const ROOT_NAME = '#document'

const DECIMAL_DIGITS = /^\d+$/
const HEX_DIGITS = /^[0-9a-fA-F]+$/

/**
 * Resolves one entity reference body, leaving anything unrecognized as written.
 */
const decodeReference = (body: string): string => {
  switch (body) {
    case 'lt':
      return '<'
    case 'gt':
      return '>'
    case 'amp':
      return '&'
    case 'quot':
      return '"'
    case 'apos':
      return "'"
  }

  if (body.charCodeAt(0) !== HASH) {
    return `&${body};`
  }

  const hexadecimal = body.charCodeAt(1) === LOWER_X || body.charCodeAt(1) === UPPER_X
  const digits = hexadecimal ? body.slice(2) : body.slice(1)
  if (!(hexadecimal ? HEX_DIGITS : DECIMAL_DIGITS).test(digits)) {
    return `&${body};`
  }

  const code = Number.parseInt(digits, hexadecimal ? 16 : 10)
  // Anything outside the Unicode range cannot be written back, so the reference stays literal.
  if (!Number.isFinite(code) || code > 0x10ffff) {
    return `&${body};`
  }

  return String.fromCodePoint(code)
}

/**
 * Replaces entity references in one run of text, leaving bare ampersands alone.
 */
const decodeText = (text: string): string => {
  const parts: string[] = []
  const length = text.length
  let start = 0
  let cursor = 0

  while (cursor < length) {
    if (text.charCodeAt(cursor) !== AMPERSAND) {
      cursor += 1
      continue
    }

    const end = text.indexOf(';', cursor + 1)
    if (end === -1) {
      cursor += 1
      continue
    }

    parts.push(text.slice(start, cursor), decodeReference(text.slice(cursor + 1, end)))
    cursor = end + 1
    start = cursor
  }

  if (parts.length === 0) {
    return text
  }

  parts.push(text.slice(start))
  return parts.join('')
}

/**
 * Reads a document into a tree, or returns `null` when it is not well formed.
 */
export const parseXml = (source: string): XmlElement | null => {
  const length = source.length
  let position = length > 0 && source.charCodeAt(0) === BYTE_ORDER_MARK ? 1 : 0
  let valid = true
  const stack: XmlElement[] = []

  const root: XmlElement = {
    nodeType: XmlNodeType.element,
    qualifiedName: ROOT_NAME,
    namespacePrefix: '',
    localName: ROOT_NAME,
    attributes: [],
    children: [],
  }
  stack.push(root)

  /**
   * Appends a text node to the element being read.
   */
  const readTextNode = (end: number) => {
    const start = position
    position = end
    if (start === end) {
      return
    }

    const parent = stack[stack.length - 1]
    if (parent === undefined) {
      valid = false
      return
    }

    const raw = source.slice(start, end)
    parent.children.push({ nodeType: XmlNodeType.text, text: raw.indexOf('&') === -1 ? raw : decodeText(raw) })
  }

  /**
   * Reads one quoted value, starting at `position`, and leaves `position` after the closing quote.
   */
  const readQuotedValue = (): string => {
    const quote = source.charCodeAt(position)
    if (quote !== DOUBLE_QUOTE && quote !== SINGLE_QUOTE) {
      // XML requires a quoted value.
      valid = false
      return ''
    }

    position += 1
    const end = source.indexOf(quote === DOUBLE_QUOTE ? '"' : "'", position)
    if (end === -1) {
      valid = false
      return ''
    }

    const raw = source.slice(position, end)
    position = end + 1
    return raw.indexOf('&') === -1 ? raw : decodeText(raw)
  }

  /**
   * Reads a start tag with its attributes, and opens the element unless it closes itself.
   */
  const readStartTag = () => {
    let cursor = position + 1
    const nameStart = cursor

    while (cursor < length) {
      const code = source.charCodeAt(cursor)
      if (code <= 32 || code === GREATER_THAN || code === SLASH || code === EQUALS) {
        break
      }
      cursor += 1
    }

    if (cursor === nameStart) {
      valid = false
      return
    }

    const qualifiedName = source.slice(nameStart, cursor)
    const attributes: XmlAttribute[] = []
    const element: XmlElement = {
      nodeType: XmlNodeType.element,
      qualifiedName,
      namespacePrefix: '',
      localName: qualifiedName,
      attributes,
      children: [],
    }
    applyXmlNameParts(qualifiedName, element)

    let closed = false
    let selfClosing = false

    while (cursor < length) {
      let code = source.charCodeAt(cursor)
      while (code <= 32) {
        cursor += 1
        if (cursor >= length) {
          break
        }
        code = source.charCodeAt(cursor)
      }
      if (cursor >= length) {
        break
      }

      if (code === GREATER_THAN) {
        cursor += 1
        closed = true
        break
      }
      if (code === SLASH) {
        cursor += 1
        if (cursor < length && source.charCodeAt(cursor) === GREATER_THAN) {
          cursor += 1
          closed = true
          selfClosing = true
          break
        }
        valid = false
        return
      }

      const attributeStart = cursor
      do {
        cursor += 1
        if (cursor >= length) {
          break
        }
        code = source.charCodeAt(cursor)
      } while (code > 32 && code !== GREATER_THAN && code !== SLASH && code !== EQUALS)
      if (cursor === attributeStart) {
        valid = false
        return
      }

      const attributeName = source.slice(attributeStart, cursor)

      while (cursor < length && source.charCodeAt(cursor) <= 32) {
        cursor += 1
      }
      if (cursor >= length || source.charCodeAt(cursor) !== EQUALS) {
        // XML requires every attribute to carry a quoted value.
        valid = false
        return
      }
      cursor += 1
      while (cursor < length && source.charCodeAt(cursor) <= 32) {
        cursor += 1
      }

      position = cursor
      const value = readQuotedValue()
      if (!valid) {
        return
      }
      cursor = position

      for (let index = 0; index < attributes.length; index += 1) {
        if (attributes[index]?.qualifiedName === attributeName) {
          // A repeated attribute name is not well formed.
          valid = false
          return
        }
      }

      attributes.push(createXmlAttribute(attributeName, value))
    }

    if (!closed) {
      valid = false
      return
    }

    position = cursor

    const parent = stack[stack.length - 1]
    if (parent === undefined) {
      valid = false
      return
    }
    parent.children.push(element)

    // A self-closing tag is complete as written.
    if (!selfClosing) {
      stack.push(element)
    }
  }

  /**
   * Closes the innermost element, which has to be the one the tag names.
   */
  const readEndTag = () => {
    let cursor = position + 2
    const nameStart = cursor

    while (cursor < length) {
      const code = source.charCodeAt(cursor)
      if (code <= 32 || code === GREATER_THAN) {
        break
      }
      cursor += 1
    }

    const name = source.slice(nameStart, cursor)
    const end = source.indexOf('>', cursor)
    if (end === -1) {
      valid = false
      return
    }
    position = end + 1

    // The root never closes, so a close tag here has no open element to match.
    if (stack.length <= 1) {
      valid = false
      return
    }

    const top = stack[stack.length - 1]
    if (top === undefined || top.qualifiedName !== name) {
      valid = false
      return
    }

    stack.pop()
  }

  /**
   * Skips a comment, CDATA section, or any other declaration such as a DOCTYPE.
   */
  const readMarkupDeclaration = () => {
    if (source.charCodeAt(position + 2) === HYPHEN && source.charCodeAt(position + 3) === HYPHEN) {
      const end = source.indexOf('-->', position + 4)
      if (end === -1) {
        valid = false
        return
      }
      position = end + 3
      return
    }

    if (source.startsWith('[CDATA[', position + 2)) {
      const start = position + 9
      const end = source.indexOf(']]>', start)
      if (end === -1) {
        valid = false
        return
      }

      const parent = stack[stack.length - 1]
      if (parent === undefined) {
        valid = false
        return
      }

      parent.children.push({ nodeType: XmlNodeType.cdata, text: source.slice(start, end) })
      position = end + 3
      return
    }

    // Any other declaration, a DOCTYPE with an internal subset included, runs to its closing bracket.
    let cursor = position + 2
    let depth = 1
    while (cursor < length && depth > 0) {
      const code = source.charCodeAt(cursor)
      if (code === LESS_THAN) {
        depth += 1
      } else if (code === GREATER_THAN) {
        depth -= 1
      }
      cursor += 1
    }

    if (depth > 0) {
      valid = false
      return
    }

    position = cursor
  }

  /**
   * Skips a processing instruction, which carries nothing the kit reads.
   */
  const readProcessingInstruction = () => {
    const end = source.indexOf('?>', position + 2)
    if (end === -1) {
      valid = false
      return
    }
    position = end + 2
  }

  /**
   * Reads content until the end of input or the end tag of the innermost element.
   */
  const readNodes = () => {
    while (position < length) {
      const open = source.indexOf('<', position)
      if (open === -1) {
        readTextNode(length)
        return
      }
      if (open > position) {
        readTextNode(open)
        if (!valid) {
          return
        }
      }

      position = open
      const next = source.charCodeAt(open + 1)

      if (next === SLASH) {
        readEndTag()
      } else if (next === EXCLAMATION) {
        readMarkupDeclaration()
      } else if (next === QUESTION) {
        readProcessingInstruction()
      } else {
        readStartTag()
      }

      if (!valid) {
        return
      }
    }
  }

  readNodes()

  // An unclosed element leaves more than the root on the stack.
  if (!valid || stack.length !== 1) {
    return null
  }

  for (let index = 0; index < root.children.length; index += 1) {
    if (root.children[index]?.nodeType === XmlNodeType.element) {
      return root
    }
  }

  return null
}
