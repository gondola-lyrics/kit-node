<template>
  <section :class="$style.section" aria-labelledby="result-heading" :aria-busy="parsing">
    <div :class="$style.heading">
      <h2 id="result-heading">{{ t('result.title') }}</h2>
      <span v-if="parsing" role="status">{{ t('result.updating') }}</span>
    </div>
    <div v-if="error" :class="$style.notice" role="alert">
      <strong>{{ t(error) }}</strong>
      <p v-if="errorDetail">{{ errorDetail }}</p>
    </div>
    <div v-else-if="invalid" :class="$style.notice" role="alert">
      <strong>{{ t('result.invalid') }}</strong>
    </div>
    <div v-else-if="result" :class="$style.card">
      <div :class="$style.summary">
        <div :class="$style.primary">
          <span>{{ timingSummary }}</span>
          <span v-if="result.diagnostics.length === 0" :class="$style.validation">{{ t('validation.pass') }}</span>
        </div>
        <div :class="$style.secondary">
          <span :title="t('result.elapsed')">{{ result.elapsed.toFixed(2) }} ms</span>
          <span :title="t('result.size')"
            >{{ formatBytes(result.inputBytes) }} → {{ result.encodedBytes === null ? '—' : formatBytes(result.encodedBytes) }}</span
          >
          <span :class="$style.version">v{{ result.lyric.version }}</span>
        </div>
      </div>
      <details v-if="result.diagnostics.length" :class="$style.diagnostics">
        <summary>
          <span
            >{{ t('validation.title') }} <span :class="$style.count">{{ result.diagnostics.length }}</span></span
          >
          <svg :class="$style.chevron" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </summary>
        <div :class="$style.table" tabindex="0" role="region" :aria-label="t('validation.title')">
          <table>
            <thead>
              <tr>
                <th scope="col">{{ t('validation.path') }}</th>
                <th scope="col">{{ t('validation.code') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in result.diagnostics" :key="index">
                <td :data-label="t('validation.path')">{{ item.path || '$' }}</td>
                <td :data-label="t('validation.code')">{{ item.code }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
      <div v-if="result.encodingError" :class="$style.notice" role="status">
        <strong>{{ t('result.encodingFailed') }}</strong>
        <p>{{ result.encodingError }}</p>
      </div>

      <OptionsPanel id="result-options" v-model="options" scope="result" :format="format">
        <ControlTabs v-model="view" :items="views" :label="t('result.views')" />
      </OptionsPanel>

      <div v-if="view === 'preview'" id="result-preview" :class="$style.preview" role="tabpanel" aria-labelledby="preview-switch">
        <LyricPreview :lyric="result.lyric" />
      </div>
      <div v-else :id="'panel-' + view" role="tabpanel" :aria-labelledby="view + '-switch'">
        <div v-if="output.error" :class="$style.notice" role="alert">
          <strong>{{ t(view === 'ttml' ? 'result.ttmlGenerationFailed' : 'result.generationFailed') }}</strong>
          <p>{{ output.error }}</p>
        </div>
        <div v-else :class="$style.codeView">
          <div :class="$style.toolbar">
            <button type="button" :class="$style.copy" :disabled="!output.text" @click="copy">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" />
                <path d="M10.5 3.5V3a1.5 1.5 0 0 0-1.5-1.5H3A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h.5" stroke="currentColor" />
              </svg>
              {{ t(copied ? 'result.copied' : 'result.copy') }}
            </button>
          </div>
          <p v-if="copyFailed" :class="$style.copyError" role="status">{{ t('result.copyFailed') }}</p>
          <pre :id="'result-' + view" :class="$style.code" tabindex="0" :aria-label="view.toUpperCase()" @keydown="selectAll">{{ output.text }}</pre>
        </div>
      </div>
    </div>
    <div v-else :class="$style.empty">
      <p>{{ t('result.empty') }}</p>
      <span>{{ t('result.emptyHint') }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { MessageKey } from '../composables/useI18n'
import type { PlaygroundOptions } from '../lib/options'
import type { PlaygroundResult, ResultView } from '../lib/playground'

import { LyricStatus, Timing, WordType } from '@gondola-lyrics/model/runtime'
import { computed, onScopeDispose, ref, watch } from 'vue'

import { generate } from '@gondola-lyrics/kit'

import { useI18n } from '../composables/useI18n'
import { formatBytes } from '../lib/format'

import OptionsPanel from './options-panel.vue'
import ControlTabs from './control-tabs.vue'
import LyricPreview from './lyric-preview.vue'

const props = defineProps<{
  result: PlaygroundResult | null
  parsing: boolean
  error: MessageKey | ''
  errorDetail: string
}>()
const options = defineModel<PlaygroundOptions>({ required: true })
const { t } = useI18n()
const view = ref<ResultView>('preview')
const format = computed(() => {
  return view.value === 'lrc' || view.value === 'ttml' ? view.value : null
})
const views = computed(() => {
  return [
    { value: 'preview' as const, label: t('result.preview'), id: 'preview-switch', controls: 'result-preview' },
    { value: 'json' as const, label: 'JSON', id: 'json-switch', controls: 'panel-json' },
    { value: 'lrc' as const, label: 'LRC', id: 'lrc-switch', controls: 'panel-lrc' },
    { value: 'ttml' as const, label: 'TTML', id: 'ttml-switch', controls: 'panel-ttml' },
  ]
})
const output = computed(() => {
  const result = props.result
  if (!result || view.value === 'preview') {
    return { text: '', error: '' }
  }
  try {
    if (view.value === 'json') {
      return { text: JSON.stringify(result.lyric, null, 2), error: '' }
    }
    // Use the processed snapshot so a pending edit cannot update just one output view.
    if (view.value === 'lrc') {
      const generated = generate(result.lyric, 'lrc', result.options.generate.lrc)
      if (!generated) {
        return { text: '', error: '' }
      }
      const sections = [generated.original]
      if (generated.translations) {
        sections.push('; translations\n' + generated.translations)
      }
      if (generated.romans) {
        sections.push('; romans\n' + generated.romans)
      }
      return { text: sections.filter(Boolean).join('\n\n'), error: '' }
    }
    const settings = result.options.generate.ttml
    return {
      text: generate(result.lyric, 'ttml', { ...settings, profile: settings.profile === 'auto' ? undefined : settings.profile }) ?? '',
      error: '',
    }
  } catch (cause) {
    return { text: '', error: cause instanceof Error ? cause.message : String(cause) }
  }
})

const invalid = computed(() => {
  return props.result !== null && props.result.lyric.status !== LyricStatus.VALID
})
const timingSummary = computed(() => {
  const lyric = props.result?.lyric
  if (!lyric) {
    return ''
  }
  const label =
    lyric.timing === Timing.WORD
      ? 'result.wordTiming'
      : lyric.timing === Timing.LINE
        ? 'result.lineTiming'
        : lyric.timing === Timing.NONE
          ? 'result.noTiming'
          : 'result.unspecified'
  let words = 0
  for (const line of lyric.lines) {
    for (const word of line.content?.words ?? []) {
      if (word.type === WordType.NORMAL) {
        words += 1
      }
    }
  }
  const parts = [t(label), lyric.lines.length + ' ' + t('result.lineUnit')]
  if (words > 0) {
    parts.push(words + ' ' + t('result.wordUnit'))
  }
  return parts.join(' · ')
})

const copied = ref(false)
const copyFailed = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

const clearFeedback = () => {
  clearTimeout(timer)
  timer = undefined
  copied.value = false
  copyFailed.value = false
}

const copy = async () => {
  clearFeedback()
  const content = output.value.text
  try {
    await navigator.clipboard.writeText(content)
    if (output.value.text === content) {
      copied.value = true
      timer = setTimeout(clearFeedback, 1800)
    }
  } catch {
    copyFailed.value = true
  }
}

// Keep Ctrl/Cmd+A inside the focused output rather than selecting the surrounding workspace.
const selectAll = (event: KeyboardEvent) => {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'a') {
    return
  }
  const target = event.currentTarget
  const selection = window.getSelection()
  if (!(target instanceof HTMLElement) || !selection) {
    return
  }
  event.preventDefault()
  const range = document.createRange()
  range.selectNodeContents(target)
  selection.removeAllRanges()
  selection.addRange(range)
}

watch(() => [view.value, output.value.text], clearFeedback)
onScopeDispose(clearFeedback)
</script>

<style module lang="scss">
.section {
  display: grid;
  align-content: start;
  gap: 12px;
  min-width: 0;
}

.heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  min-height: 20px;

  h2 {
    margin: 0;
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
  }

  > span {
    color: var(--muted);
    font-size: 11px;
  }
}

.card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: #fff;
}

.preview {
  --result-pad: 16px;

  min-width: 0;
}

.empty {
  display: flex;
  min-height: 200px;
  padding: 32px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  border: 1px dashed #c8dce9;
  border-radius: var(--radius);
  background: rgb(255 255 255 / 60%);
  color: var(--muted);
  text-align: center;

  p {
    margin: 0;
    color: var(--text);
    font-size: 13px;
  }

  > span {
    font-size: 12px;
    line-height: 1.7;
  }
}

@media (max-width: 520px) {
  .preview {
    --result-pad: 12px;
  }
}

.summary {
  display: grid;
  gap: 10px;
  padding: 16px;
  border-bottom: 1px solid var(--line);
}

.primary,
.secondary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 16px;
  min-width: 0;
  color: var(--muted);
  font-size: 11px;
}

.validation {
  margin-left: auto;
}

.secondary {
  font: 10.5px var(--mono);
}

.version {
  margin-left: auto;
}

@media (max-width: 520px) {
  .summary {
    padding: 13px 12px;
  }

  .primary,
  .secondary {
    gap: 8px 12px;
  }

  .validation {
    margin-left: 0;
  }
}

.diagnostics {
  container: diagnostics / inline-size;
  border-bottom: 1px solid #efe0c2;
  background: #fffbf3;

  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 44px;
    padding: 10px 16px;
    color: #805d25;
    font-size: 12px;
    line-height: 1.6;
    list-style: none;
    cursor: pointer;

    &::-webkit-details-marker {
      display: none;
    }
  }

  &[open] {
    summary {
      border-bottom: 1px solid #efe0c2;
    }

    .chevron {
      transform: rotate(180deg);
    }
  }
}

.chevron {
  flex-shrink: 0;
  transition: transform 120ms ease;
}

.count {
  margin-left: 6px;
  font-family: var(--mono);
}

.table {
  max-height: min(320px, 50vh);
  overflow: auto;
  background: #fff;

  table {
    width: 100%;
    table-layout: fixed;
    border-collapse: separate;
    border-spacing: 0;
    text-align: left;
    font-size: 11.5px;
    line-height: 1.65;
  }

  th,
  td {
    padding: 9px 16px;
    border-bottom: 1px solid #f0e9dc;
    vertical-align: top;
  }

  th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: #fff9ed;
    color: #805d25;
    font-size: 11px;
    font-weight: 500;

    &:first-child {
      width: 55%;
    }
  }

  td {
    font-family: var(--mono);
    overflow-wrap: anywhere;

    &:first-child {
      color: var(--muted);
    }
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }
}

@container diagnostics (max-width: 520px) {
  .diagnostics summary {
    padding-inline: 12px;
  }

  .table {
    table,
    tbody,
    tr {
      display: block;
    }

    thead {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    tbody tr {
      padding: 12px;
      border-bottom: 1px solid #f0e9dc;

      &:last-child {
        border-bottom: 0;
      }
    }

    td {
      display: grid;
      grid-template-columns: 36px minmax(0, 1fr);
      gap: 8px;
      padding: 0;
      border: 0;

      + td {
        margin-top: 6px;
      }

      &::before {
        content: attr(data-label);
        color: #805d25;
        font-family: 'MiSans', 'Microsoft YaHei', sans-serif;
        font-size: 11px;
      }
    }
  }
}

.codeView {
  min-width: 0;
  background: #fbfdff;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 6px 16px;
  border-bottom: 1px solid var(--line);
}

.copy {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 32px;
  padding: 0 2px;
  border: 0;
  background: none;
  color: var(--muted);
  font-size: 11px;

  &:hover {
    color: var(--primary-deep);
  }
}

.code {
  max-height: 680px;
  margin: 0;
  padding: 18px 16px;
  overflow: auto;
  color: #1c3b54;
  font: 11.5px / 1.8 var(--mono);
  tab-size: 2;
  white-space: pre;
}

.copyError {
  margin: 0;
  padding: 8px 16px;
  color: #8f3548;
  font-size: 11px;
}

@media (max-width: 520px) {
  .toolbar {
    padding-inline: 12px;
  }

  .copy {
    min-height: 40px;
  }

  .code {
    padding: 14px 12px;
  }
}

.notice {
  padding: 12px 16px;
  border: 1px solid #edd9de;
  border-radius: var(--radius);
  background: #fff7f8;
  color: #8f3548;
  font-size: 12px;
  line-height: 1.7;
  overflow-wrap: anywhere;

  strong {
    font-weight: 550;
  }

  p {
    margin: 4px 0 0;
  }
}
</style>
