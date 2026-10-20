/**
 * Returns a language tag in the canonical form the model stores, which is lower case.
 *
 * This mirrors the model's own helper, which it does not export.
 * Comparing tags stays with the consumer, since BCP 47 matches by subtag prefix rather than by string equality.
 */
export const lowerTag = (tag: string | undefined): string | undefined => {
  return tag ? tag.toLowerCase() : undefined
}
