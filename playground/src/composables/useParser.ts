import type { Diagnostic, Lyric } from '@gondola-lyrics/model/runtime'
import type { MessageKey } from './useI18n'

import { canonicalizeLyric, encode, validateLyric } from '@gondola-lyrics/model/runtime'
import { computed, nextTick, onScopeDispose, reactive, ref, shallowRef, watch } from 'vue'

import { generate, parse, parseLrc } from '@gondola-lyrics/kit'

interface FormState {
  mode: 'auto' | 'lrc'
  /** Each mode keeps its own text, so switching never carries one format's source into another. */
  autoContent: string
  lrcContent: string
  /** LRC keeps translations and romanizations in their own files, so they get their own inputs. */
  translations: string
  romans: string
}

interface ParsedResult {
  lyric: Lyric
  diagnostics: Diagnostic[]
  elapsed: number
  inputBytes: number
  encodedBytes: number | null
  encodingError: string
}

const STORAGE_KEY = 'gondola-playground-input-v1'
const AUTO_PARSE_INTERVAL = 300

const encoder = new TextEncoder()

const readText = (saved: Record<string, unknown>, key: string): string => {
  const value = saved[key]
  return typeof value === 'string' ? value : ''
}

const readForm = (): FormState => {
  const defaults: FormState = { mode: 'auto', autoContent: '', lrcContent: '', translations: '', romans: '' }
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return defaults
    }
    const saved = raw as Record<string, unknown>
    const mode = saved.mode === 'lrc' ? 'lrc' : 'auto'
    // An older entry stored one `content` field; it belongs to whichever mode was selected then.
    const legacy = readText(saved, 'content')
    return {
      mode,
      autoContent: readText(saved, 'autoContent') || (mode === 'auto' ? legacy : ''),
      lrcContent: readText(saved, 'lrcContent') || (mode === 'lrc' ? legacy : ''),
      translations: readText(saved, 'translations'),
      romans: readText(saved, 'romans'),
    }
  } catch {
    return defaults
  }
}

/**
 * Coalesce edits into a trailing parse without postponing it throughout continuous input.
 * Manual parsing bypasses the timer; disposing the view cancels queued work.
 */
export const useParser = () => {
  const form = reactive(readForm())
  const result = shallowRef<ParsedResult | null>(null)
  const parsing = ref(false)
  const error = ref<MessageKey | ''>('')
  const errorDetail = ref('')
  const storageAvailable = ref(true)
  let lastInput = ''
  let timer: ReturnType<typeof setTimeout> | undefined
  let queued = false
  let disposed = false

  const json = computed(() => {
    return result.value ? JSON.stringify(result.value.lyric, null, 2) : ''
  })
  const lrc = computed(() => {
    return result.value ? generate(result.value.lyric, 'lrc') : null
  })

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
    const input = { ...form }
    lastInput = JSON.stringify(input)
    resetResult()

    // Only the selected mode's source is parsed, and its annotation tracks travel with it.
    const content = input.mode === 'lrc' ? input.lrcContent : input.autoContent
    if (!content.trim()) {
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
          ? parseLrc({
              original: input.lrcContent,
              translations: input.translations.trim() ? input.translations : undefined,
              romans: input.romans.trim() ? input.romans : undefined,
            })
          : parse(input.autoContent)
      if (!parsed) {
        error.value = 'error.unrecognized'
        return
      }
      const lyric = canonicalizeLyric(parsed)
      const diagnostics = validateLyric(lyric)
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
        inputBytes: encoder.encode(input.mode === 'lrc' ? input.lrcContent + input.translations + input.romans : input.autoContent).byteLength,
        encodedBytes,
        encodingError,
      }
    } catch (cause) {
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
        localStorage.setItem(STORAGE_KEY, JSON.stringify(form))
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

  return { form, result, parsing, error, errorDetail, storageAvailable, json, lrc }
}
