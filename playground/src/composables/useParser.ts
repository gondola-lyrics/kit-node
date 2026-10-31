import type { PlaygroundForm, PlaygroundResult } from '../lib/playground'
import type { MessageKey } from './useI18n'

import { encode, validateLyric } from '@gondola-lyrics/model/runtime'
import { nextTick, onScopeDispose, reactive, ref, shallowRef, watch } from 'vue'

import {
  deriveWordEmphasis,
  extractBackgroundLines,
  extractCredits,
  insertInstrumentalLines,
  insertSpacesInLines,
  parse,
  parseLrc,
  parseTtml,
  stripBackgroundBrackets,
} from '@gondola-lyrics/kit'

import { createOptions, getOptionOverrides, readOptions } from '../lib/options'

const STORAGE_KEY = 'gondola-playground-input-v1'
const AUTO_PARSE_INTERVAL = 300

const encoder = new TextEncoder()

const readText = (saved: Record<string, unknown>, key: string): string => {
  const value = saved[key]
  return typeof value === 'string' ? value : ''
}

const readForm = (): PlaygroundForm => {
  const defaults: PlaygroundForm = {
    mode: 'auto',
    autoContent: '',
    lrcContent: '',
    ttmlContent: '',
    translations: '',
    romans: '',
    options: createOptions(),
  }
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return defaults
    }
    const saved = raw as Record<string, unknown>
    const mode = saved.mode === 'lrc' || saved.mode === 'ttml' ? saved.mode : 'auto'
    // An older entry stored one `content` field; it belongs to whichever mode was selected then.
    const legacy = readText(saved, 'content')
    return {
      mode,
      autoContent: readText(saved, 'autoContent') || (mode === 'auto' ? legacy : ''),
      lrcContent: readText(saved, 'lrcContent') || (mode === 'lrc' ? legacy : ''),
      ttmlContent: readText(saved, 'ttmlContent') || (mode === 'ttml' ? legacy : ''),
      translations: readText(saved, 'translations'),
      romans: readText(saved, 'romans'),
      options: readOptions(saved.options),
    }
  } catch {
    return defaults
  }
}

/**
 * Coalesce source and option edits into one trailing update without postponing continuous input.
 * Generated views use the same snapshot so they cannot bypass the shared throttle.
 */
export const useParser = () => {
  const form = reactive(readForm())
  const result = shallowRef<PlaygroundResult | null>(null)
  const parsing = ref(false)
  const error = ref<MessageKey | ''>('')
  const errorDetail = ref('')
  const storageAvailable = ref(true)
  let lastInput = ''
  let timer: ReturnType<typeof setTimeout> | undefined
  let queued = false
  let disposed = false

  const cancelScheduledParse = () => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
    queued = false
  }

  const resetResult = () => {
    result.value = null
    error.value = ''
    errorDetail.value = ''
  }

  const scheduleParse = (): void => {
    if (disposed) {
      return
    }
    if (JSON.stringify(form) === lastInput) {
      cancelScheduledParse()
      return
    }
    queued = true
    if (timer !== undefined || parsing.value) {
      return
    }
    // Keep the first deadline; resetting it on each edit would debounce instead of throttle.
    timer = setTimeout(() => {
      timer = undefined
      void runParse()
    }, AUTO_PARSE_INTERVAL)
  }

  const runParse = async (): Promise<void> => {
    if (disposed || parsing.value) {
      return
    }
    cancelScheduledParse()
    const input = { ...form, options: readOptions(form.options) }
    lastInput = JSON.stringify(form)
    error.value = ''
    errorDetail.value = ''

    // Only the selected mode's source is parsed, and its annotation tracks travel with it.
    const content = input.mode === 'lrc' ? input.lrcContent : input.mode === 'ttml' ? input.ttmlContent : input.autoContent
    if (!content.trim()) {
      resetResult()
      return
    }

    parsing.value = true
    try {
      await nextTick()
      if (disposed) {
        return
      }
      const start = performance.now()
      const parsed =
        input.mode === 'lrc'
          ? parseLrc(
              {
                original: input.lrcContent,
                translations: input.translations.trim() ? input.translations : undefined,
                romans: input.romans.trim() ? input.romans : undefined,
              },
              input.options.parse.lrc,
            )
          : input.mode === 'ttml'
            ? parseTtml(input.ttmlContent, { language: input.options.parse.ttml.language.trim() || undefined })
            : parse(input.autoContent, { ...input.options.parse.lrc, language: input.options.parse.ttml.language.trim() || undefined })
      if (!parsed) {
        result.value = null
        error.value = 'error.unrecognized'
        return
      }
      // Restart from the parsed model so disabling a transform also removes its derived changes.
      let lyric = parsed.lyric
      const { credits, instrumental, emphasis, extract, brackets, spaces } = input.options.transforms
      if (credits.enabled) {
        lyric = extractCredits(lyric, credits)
      }
      if (extract.enabled) {
        lyric = extractBackgroundLines(lyric, extract)
      }
      if (brackets.enabled) {
        lyric = stripBackgroundBrackets(lyric)
      }
      if (spaces.enabled) {
        lyric = insertSpacesInLines(lyric, spaces)
      }
      if (instrumental.enabled) {
        lyric = insertInstrumentalLines(lyric, instrumental)
      }
      if (emphasis.enabled) {
        lyric = deriveWordEmphasis(lyric, emphasis)
      }
      const diagnostics = lyric === parsed.lyric ? parsed.diagnostics : validateLyric(lyric)
      let encodedBytes: number | null = null
      let encodingError = ''
      try {
        encodedBytes = encode(lyric).byteLength
      } catch (cause) {
        // Encoding failure must not hide the invalid model that the user is inspecting.
        encodingError = cause instanceof Error ? cause.message : String(cause)
      }
      result.value = {
        lyric,
        diagnostics,
        elapsed: performance.now() - start,
        inputBytes: encoder.encode(content + (input.mode === 'lrc' ? input.translations + input.romans : '')).byteLength,
        encodedBytes,
        encodingError,
        options: input.options,
      }
    } catch (cause) {
      result.value = null
      error.value = 'error.unexpected'
      errorDetail.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      parsing.value = false
      if (queued) {
        scheduleParse()
      }
    }
  }

  watch(
    form,
    () => {
      try {
        const { options, ...input } = form
        const overrides = getOptionOverrides(options)
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...input, ...(overrides ? { options: overrides } : {}) }))
        storageAvailable.value = true
      } catch {
        storageAvailable.value = false
      }
      scheduleParse()
    },
    { deep: true, immediate: true },
  )

  onScopeDispose(() => {
    disposed = true
    cancelScheduledParse()
  })

  return { form, result, parsing, error, errorDetail, storageAvailable }
}
