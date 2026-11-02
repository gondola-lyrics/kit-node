import type { runtime } from '@gondola-lyrics/model'
import type { AnnotationMatchOptions, AnnotationSources } from '@root/utils'

import { attachLineAnnotations } from '@root/utils'

/**
 * Keeps timing placeholders and fills compatible complete tracks before bounded time fallback.
 *
 * @param lines Original QRC rows in input order.
 * @param sources Auxiliary tracks as model lines.
 * @param options Extra tolerance and source timestamp information.
 *
 * @returns Annotated rows with the QRC matching defaults.
 */
export const attachAnnotations = (lines: runtime.Line[], sources: AnnotationSources, options: AnnotationMatchOptions = {}): runtime.Line[] => {
  return attachLineAnnotations(lines, sources, { matchByOrder: true, preservePlaceholders: true, ...options })
}
