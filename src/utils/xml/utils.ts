export const XmlNodeType = {
  element: 1,
  text: 2,
  cdata: 3,
} as const

export interface XmlAttribute {
  /** Name exactly as written, namespace prefix included, such as `ttm:agent`. */
  qualifiedName: string
  /** Decoded value, with entity references already resolved. */
  value: string
  /** Namespace prefix such as `ttm`, empty when the name carries none. */
  namespacePrefix: string
  /** Name without its prefix, such as `agent`, which is what format lookups match. */
  localName: string
}

export interface XmlElement {
  /** Discriminant that tells this node apart from text and CDATA. */
  nodeType: typeof XmlNodeType.element
  /** Name exactly as written, namespace prefix included, such as `ttm:name`. */
  qualifiedName: string
  /** Namespace prefix such as `ttm`, empty when the name carries none. */
  namespacePrefix: string
  /** Name without its prefix, such as `name`, which is what format lookups match. */
  localName: string
  /** Attributes in document order, which keeps a source's own ordering readable. */
  attributes: XmlAttribute[]
  /** Child nodes in document order, text and CDATA included. */
  children: XmlNode[]
}

export interface XmlText {
  /** Discriminant that tells this node apart from elements and CDATA. */
  nodeType: typeof XmlNodeType.text
  /** Decoded text, with entity references already resolved. */
  text: string
}

export interface XmlCdata {
  /** Discriminant that tells this node apart from elements and text. */
  nodeType: typeof XmlNodeType.cdata
  /** Raw text between the CDATA markers, which is never decoded. */
  text: string
}

export type XmlNode = XmlElement | XmlText | XmlCdata

/**
 * Only prefixed names need their split cached, since an unprefixed one keeps its name as the local part.
 * The cache is bounded, which keeps an adversarial document from growing it without limit.
 */
const prefixedNames = new Map<string, { namespacePrefix: string; localName: string }>()

/**
 * Splits a qualified name into its namespace prefix and local name.
 */
const splitXmlName = (name: string) => {
  const cached = prefixedNames.get(name)
  if (cached !== undefined) {
    return cached
  }

  const colon = name.indexOf(':')
  const split = colon === -1 ? { namespacePrefix: '', localName: name } : { namespacePrefix: name.slice(0, colon), localName: name.slice(colon + 1) }
  if (split.namespacePrefix !== '' && prefixedNames.size < 1024) {
    prefixedNames.set(name, split)
  }

  return split
}

/**
 * Writes the prefix and local part onto a node that already carries the full name.
 */
export const applyXmlNameParts = (name: string, target: { namespacePrefix: string; localName: string }) => {
  if (name.indexOf(':') === -1) {
    target.namespacePrefix = ''
    target.localName = name
    return
  }

  const split = splitXmlName(name)
  target.namespacePrefix = split.namespacePrefix
  target.localName = split.localName
}

/**
 * Creates an attribute from its full name and value.
 */
export const createXmlAttribute = (qualifiedName: string, value: string): XmlAttribute => {
  const attribute: XmlAttribute = { qualifiedName, value, namespacePrefix: '', localName: qualifiedName }
  applyXmlNameParts(qualifiedName, attribute)

  return attribute
}

/**
 * Creates an element from its full name, with attributes and children in the order given.
 */
export const createXmlElement = (
  qualifiedName: string,
  attributes: readonly (readonly [string, string])[] = [],
  children: readonly XmlNode[] = [],
): XmlElement => {
  const element: XmlElement = {
    nodeType: XmlNodeType.element,
    qualifiedName,
    namespacePrefix: '',
    localName: qualifiedName,
    attributes: attributes.map(([name, value]) => {
      return createXmlAttribute(name, value)
    }),
    children: [...children],
  }
  applyXmlNameParts(qualifiedName, element)

  return element
}

/**
 * Creates a text node, whose value the writer escapes.
 */
export const createXmlText = (text: string): XmlText => {
  return { nodeType: XmlNodeType.text, text }
}

/**
 * Creates a CDATA node, whose value the writer emits verbatim.
 */
export const createXmlCdata = (text: string): XmlCdata => {
  return { nodeType: XmlNodeType.cdata, text }
}

/**
 * Returns the value of one attribute, matched by its local name so the prefix never has to be known.
 */
export const getXmlAttribute = (element: XmlElement, localName: string): string | undefined => {
  const attributes = element.attributes
  for (let index = 0; index < attributes.length; index += 1) {
    const attribute = attributes[index]
    if (attribute !== undefined && attribute.localName === localName) {
      return attribute.value
    }
  }

  return undefined
}

/**
 * Returns the value of one attribute, matched by its full name including the prefix.
 */
export const getXmlQualifiedAttribute = (element: XmlElement, qualifiedName: string): string | undefined => {
  const attributes = element.attributes
  for (let index = 0; index < attributes.length; index += 1) {
    const attribute = attributes[index]
    if (attribute !== undefined && attribute.qualifiedName === qualifiedName) {
      return attribute.value
    }
  }

  return undefined
}

/**
 * Returns the direct element children carrying one local name.
 */
export const getXmlChildElements = (element: XmlElement, localName: string): XmlElement[] => {
  const result: XmlElement[] = []
  const children = element.children

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]
    if (child !== undefined && child.nodeType === XmlNodeType.element && child.localName === localName) {
      result.push(child)
    }
  }

  return result
}

/**
 * Reports whether the element has a direct child with one local name.
 */
export const hasXmlChildElement = (element: XmlElement, localName: string): boolean => {
  const children = element.children

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]
    if (child !== undefined && child.nodeType === XmlNodeType.element && child.localName === localName) {
      return true
    }
  }

  return false
}

/**
 * Returns the first element carrying one local name, the element itself included, in document order.
 */
export const findXmlElement = (element: XmlElement, localName: string): XmlElement | undefined => {
  const stack: XmlNode[] = [element]

  while (stack.length > 0) {
    const node = stack.pop()
    if (node === undefined || node.nodeType !== XmlNodeType.element) {
      continue
    }
    if (node.localName === localName) {
      return node
    }
    // Pushing in reverse makes the stack pop children in document order.
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index]
      if (child !== undefined) {
        stack.push(child)
      }
    }
  }

  return undefined
}

/**
 * Returns every element carrying one local name, the element itself included, in document order.
 */
export const findXmlElements = (element: XmlElement, localName: string): XmlElement[] => {
  const result: XmlElement[] = []
  const stack: XmlNode[] = [element]

  while (stack.length > 0) {
    const node = stack.pop()
    if (node === undefined || node.nodeType !== XmlNodeType.element) {
      continue
    }
    if (node.localName === localName) {
      result.push(node)
    }
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index]
      if (child !== undefined) {
        stack.push(child)
      }
    }
  }

  return result
}

/**
 * Groups every element carrying one of the given local names, in document order.
 */
export const groupXmlElements = (element: XmlElement, localNames: readonly string[]): Map<string, XmlElement[]> => {
  const wanted = new Set(localNames)
  const result = new Map<string, XmlElement[]>()
  const stack: XmlNode[] = [element]

  while (stack.length > 0) {
    const node = stack.pop()
    if (node === undefined || node.nodeType !== XmlNodeType.element) {
      continue
    }

    if (wanted.has(node.localName)) {
      const group = result.get(node.localName)
      if (group === undefined) {
        result.set(node.localName, [node])
      } else {
        group.push(node)
      }
    }

    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index]
      if (child !== undefined) {
        stack.push(child)
      }
    }
  }

  return result
}

/**
 * Joins the text and CDATA content of a node and its descendants, in document order.
 */
export const getXmlTextContent = (node: XmlNode): string => {
  if (node.nodeType !== XmlNodeType.element) {
    return node.text
  }

  const parts: string[] = []
  const stack: XmlNode[] = [node]

  while (stack.length > 0) {
    const current = stack.pop()
    if (current === undefined) {
      continue
    }
    if (current.nodeType === XmlNodeType.element) {
      for (let index = current.children.length - 1; index >= 0; index -= 1) {
        const child = current.children[index]
        if (child !== undefined) {
          stack.push(child)
        }
      }
      continue
    }
    parts.push(current.text)
  }

  return parts.join('')
}
