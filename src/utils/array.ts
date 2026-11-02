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

/**
 * Finds the first value meeting a lower bound so range queries can skip earlier candidates.
 *
 * @param values Values sorted in ascending order.
 * @param target Inclusive lower bound.
 *
 * @returns The first matching index, or the array length when every value is smaller.
 */
export const lowerBound = (values: readonly number[], target: number): number => {
  let left = 0
  let right = values.length
  while (left < right) {
    const middle = Math.floor((left + right) / 2)
    if (values[middle]! < target) {
      left = middle + 1
    } else {
      right = middle
    }
  }
  return left
}
