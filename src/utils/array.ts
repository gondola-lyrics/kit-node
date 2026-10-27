/**
 * Preserves the input array when every element keeps its identity, so unchanged parent nodes can also be reused.
 *
 * The callback must leave inputs untouched and return the original element when unchanged.
 */
export const mapShared = <T>(items: T[], transform: (item: T) => T): T[] => {
  let result = items
  for (const [index, item] of items.entries()) {
    const transformed = transform(item)
    if (transformed !== item) {
      if (result === items) {
        result = [...items]
      }
      result[index] = transformed
    }
  }
  return result
}
