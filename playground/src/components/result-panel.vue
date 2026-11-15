<template>
  <section :class="$style.section" aria-labelledby="result-heading" :aria-busy="parsing">
    <div :class="$style.heading">
      <NH2 id="result-heading" :class="$style.title">{{ t('result.title') }}</NH2>
      <NText v-if="parsing" depth="3" :class="$style.updating" role="status"><NSpin size="small" /> {{ t('result.updating') }}</NText>
    </div>
    <NAlert v-if="error" type="error" :title="t(error)" role="alert">{{ errorDetail }}</NAlert>
    <NAlert v-else-if="invalid" type="warning" :title="t('result.invalid')" role="alert" />
    <NCard :class="$style.card" :content-style="{ padding: 0 }">
      <template v-if="result && !error && !invalid">
        <div :class="$style.summary">
          <div :class="$style.primary">
            <NText>{{ timingSummary }}</NText>
            <NTag v-if="result.diagnostics.length === 0" size="small" type="primary" :bordered="false" :class="$style.validation">{{
              t('validation.pass')
            }}</NTag>
          </div>
          <div :class="$style.secondary">
            <NTooltip
              ><template #trigger
                ><NText depth="3">{{ result.elapsed.toFixed(2) }} ms</NText></template
              >{{ t('result.elapsed') }}</NTooltip
            >
            <NTooltip
              ><template #trigger
                ><NText depth="3"
                  >{{ formatBytes(result.inputBytes) }} → {{ result.encodedBytes === null ? '—' : formatBytes(result.encodedBytes) }}</NText
                ></template
              >{{ t('result.size') }}</NTooltip
            >
            <NText depth="3" :class="$style.version">v{{ result.lyric.version }}</NText>
          </div>
        </div>
        <NCollapse v-if="result.diagnostics.length" v-model:expanded-names="diagnosticPanels" :class="$style.diagnostics" arrow-placement="right">
          <NCollapseItem name="diagnostics">
            <template #header>
              <NButton
                text
                :class="$style.diagnosticsHeader"
                :aria-expanded="diagnosticPanels.includes('diagnostics')"
                aria-controls="diagnostics-panel"
                @click.stop="diagnosticPanels = diagnosticPanels.length ? [] : ['diagnostics']"
              >
                <NText>{{ t('validation.title') }}</NText>
                <NTag size="small" type="warning" :bordered="false">{{ result.diagnostics.length }}</NTag>
              </NButton>
            </template>
            <NDataTable
              id="diagnostics-panel"
              :columns="diagnosticColumns"
              :data="result.diagnostics"
              :pagination="false"
              :bordered="false"
              :single-line="false"
              :max-height="320"
              size="small"
            />
          </NCollapseItem>
        </NCollapse>
        <NAlert v-if="result.encodingError" type="error" :title="t('result.encodingFailed')" :class="$style.notice" role="status">{{
          result.encodingError
        }}</NAlert>
      </template>

      <OptionsPanel id="result-options" v-model="options" scope="result" :format="format">
        <ControlTabs v-if="result && !error && !invalid" v-model="view" :items="views" :label="t('result.views')" />
      </OptionsPanel>

      <template v-if="result && !error && !invalid">
        <div v-if="view === 'preview'" id="result-preview" :class="$style.preview" role="tabpanel" aria-labelledby="preview-switch">
          <LyricPreview :lyric="result.lyric" />
        </div>
        <div v-else :id="'panel-' + view" role="tabpanel" :aria-labelledby="view + '-switch'">
          <NAlert
            v-if="output.error"
            type="error"
            :title="t(view === 'ttml' ? 'result.ttmlGenerationFailed' : 'result.generationFailed')"
            :class="$style.notice"
            role="alert"
            >{{ output.error }}</NAlert
          >
          <div v-else :class="$style.codeView">
            <NButton :class="$style.copy" size="small" color="#e3f1fb" text-color="#1d5b80" :disabled="!output.text" @click="copy">{{
              t(copied ? 'result.copied' : 'result.copy')
            }}</NButton>
            <NAlert v-if="copyFailed" type="error" :show-icon="false" :class="$style.notice" role="status">{{ t('result.copyFailed') }}</NAlert>
            <NCode
              :id="'result-' + view"
              :code="output.text"
              :language="view === 'json' ? 'json' : view === 'ttml' ? 'xml' : undefined"
              :trim="false"
              word-wrap
              :class="$style.code"
              tabindex="0"
              :aria-label="view.toUpperCase()"
              @keydown="selectAll"
            />
          </div>
        </div>
      </template>
      <NEmpty v-else-if="!error && !invalid" :description="t('result.empty')" :class="$style.empty">
        <template #extra
          ><NText depth="3">{{ t('result.emptyHint') }}</NText></template
        >
      </NEmpty>
    </NCard>
  </section>
</template>

<script setup lang="ts">
import type { MessageKey } from '../composables/useI18n'
import type { PlaygroundOptions } from '../lib/options'
import type { PlaygroundResult, ResultView } from '../lib/playground'

import { EnrichedLyricStatus, EnrichedWordType, TimingLevel } from '@gondola-lyrics/model'
import { NAlert, NButton, NCard, NCode, NCollapse, NCollapseItem, NDataTable, NEmpty, NH2, NSpin, NTag, NText, NTooltip } from 'naive-ui'
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
const diagnosticPanels = ref<string[]>([])
const diagnosticColumns = computed(() => {
  return [
    { title: t('validation.path'), key: 'path', render: (item: { path: string }) => item.path || '$' },
    { title: t('validation.code'), key: 'code' },
  ]
})
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
  return !!props.result && props.result.lyric.status !== EnrichedLyricStatus.VALID
})
const timingSummary = computed(() => {
  const lyric = props.result?.lyric
  if (!lyric) {
    return ''
  }
  const label =
    lyric.timing === TimingLevel.WORD
      ? 'result.wordTiming'
      : lyric.timing === TimingLevel.LINE
        ? 'result.lineTiming'
        : lyric.timing === TimingLevel.NONE
          ? 'result.noTiming'
          : 'result.unspecified'
  let words = 0
  for (const line of lyric.lines) {
    for (const word of line.content?.words ?? []) {
      if (word.type === EnrichedWordType.NORMAL) {
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
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 20px;
}

.title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.updating {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}

.card {
  min-width: 0;
  overflow: hidden;
}

.preview {
  --result-pad: 16px;
  min-width: 0;
}

.empty {
  padding: 40px 20px;
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
  font-size: 12px;
}

.secondary {
  font: 11px var(--mono);
}

.validation,
.version {
  margin-left: auto;
}

.diagnostics {
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);

  :global(.n-collapse-item__header-main) {
    gap: 8px;
  }

  :global(.n-data-table-td) {
    font: 11px / 1.7 var(--mono);
    overflow-wrap: anywhere;
  }
}

.diagnosticsHeader {
  width: 100%;

  :global(.n-button__content) {
    justify-content: flex-start;
    gap: 8px;
    width: 100%;
  }
}

.notice {
  margin: 16px;
}

.codeView {
  position: relative;
  min-width: 0;
  background: #fcfdff;
}

.copy {
  position: absolute;
  top: 12px;
  right: 16px;
  z-index: 1;
}

.code {
  display: block;
  max-height: 680px;
  overflow: auto;
  padding: 16px 16px 20px;
  font: 12px / 1.8 var(--mono);
}

@media (max-width: 520px) {
  .preview {
    --result-pad: 12px;
  }

  .summary,
  .diagnostics {
    padding-inline: 12px;
  }

  .primary,
  .secondary {
    gap: 8px 12px;
  }

  .validation {
    margin-left: 0;
  }

  .code {
    padding-inline: 12px;
  }

  .copy {
    right: 12px;
  }
}
</style>
