<template>
  <div :class="$style.preview">
    <section v-if="lyric.format || metadata.length || lyric.languageUsages.length || performers.length" :class="$style.header">
      <NDescriptions
        :column="1"
        label-placement="left"
        size="small"
        separator=""
        :class="$style.rows"
        :label-style="{ display: 'inline-block', width: 'var(--metadata-label-width)', marginRight: '14px', verticalAlign: 'top' }"
        :content-style="{ display: 'inline-block', width: 'calc(100% - var(--metadata-label-width) - 14px)', verticalAlign: 'top' }"
      >
        <NDescriptionsItem v-if="lyric.format" :label="t('result.format') + ':'">
          <NTag size="small" type="primary" :class="$style.value">{{ lyric.format }}</NTag>
        </NDescriptionsItem>
        <NDescriptionsItem v-if="lyric.languageUsages.length" :label="t('result.languages') + ':'">
          <NSpace :size="[8, 6]">
            <NTag v-for="(language, index) in lyric.languageUsages" :key="index" size="small" type="primary" :class="$style.value">
              {{ language.tag }} · {{ language.lineCount }} {{ t('result.lineUnit') }}
            </NTag>
          </NSpace>
        </NDescriptionsItem>
        <NDescriptionsItem v-if="performers.length" :label="t('result.agents') + ':'">
          <NSpace :size="[8, 6]">
            <NTag
              v-for="(performer, index) in performers"
              :key="index"
              size="small"
              :class="[$style.value, { [$style.identifier]: performer.fallback }]"
              >{{ performer.text }}</NTag
            >
          </NSpace>
        </NDescriptionsItem>
        <NDescriptionsItem v-for="(row, index) in metadata" :key="index">
          <template #label>
            <NText depth="3" :class="{ [$style.identifier]: row.raw }">{{ row.label }}:</NText>
            <NText v-if="row.detail" depth="3" :class="$style.detail">({{ row.detail }})</NText>
          </template>
          <NSpace :size="[8, 6]">
            <NTooltip v-for="(value, valueIndex) in row.values" :key="valueIndex" :disabled="!value.language">
              <template #trigger
                ><NTag size="small" :class="$style.value">{{ value.text }}</NTag></template
              >
              {{ value.language }}
            </NTooltip>
          </NSpace>
        </NDescriptionsItem>
      </NDescriptions>
    </section>
    <section :class="$style.linesSection">
      <NEmpty v-if="!lyric.lines.length" :class="$style.noLines" :description="t('result.noLines')" />
      <NList v-else :class="$style.lines" :aria-label="t('result.lines')" role="list">
        <NListItem v-for="(line, index) in lyric.lines" :key="index" role="listitem">
          <LyricLine :line="line" :agents="lyric.agents" />
        </NListItem>
      </NList>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { EnrichedLyric, Text } from '@gondola-lyrics/model'
import type { MessageKey } from '../composables/useI18n'

import { CreditRole } from '@gondola-lyrics/model'
import { NDescriptions, NDescriptionsItem, NEmpty, NList, NListItem, NSpace, NTag, NText, NTooltip } from 'naive-ui'
import { computed } from 'vue'

import { useI18n } from '../composables/useI18n'
import { formatTime } from '../lib/format'

import LyricLine from './lyric-line.vue'

interface MetadataRow {
  label: string
  values: { text: string; language?: string }[]
  detail?: string
  raw?: boolean
}

const CREDIT_ROLE_LABELS = new Map<CreditRole, MessageKey>([
  [CreditRole.OTHER, 'meta.creditOther'],
  [CreditRole.LYRICIST, 'meta.creditLyricist'],
  [CreditRole.COMPOSER, 'meta.creditComposer'],
  [CreditRole.ARRANGER, 'meta.creditArranger'],
  [CreditRole.PRODUCER, 'meta.creditProducer'],
  [CreditRole.PERFORMER, 'meta.creditPerformer'],
  [CreditRole.MIXING_ENGINEER, 'meta.creditMixer'],
  [CreditRole.MASTERING_ENGINEER, 'meta.creditMastering'],
])

const props = defineProps<{ lyric: EnrichedLyric }>()
const { t } = useI18n()

const metadata = computed(() => {
  const meta = props.lyric.meta
  const rows: MetadataRow[] = []
  if (!meta) {
    return rows
  }

  const pushTexts = (key: MessageKey, values: Text[]) => {
    if (!values.length) {
      return
    }
    rows.push({
      label: t(key),
      values: values.map((value) => ({ text: value.text, language: value.language })),
    })
  }
  const pushValue = (label: string, text: string, raw = false) => {
    rows.push({ label, values: [{ text }], raw })
  }

  pushTexts('meta.title', meta.titles)
  pushTexts('meta.artist', meta.artists)
  pushTexts('meta.album', meta.albums)
  pushTexts('meta.author', meta.authors)
  for (const credit of meta.credits) {
    if (!credit.names.length) {
      continue
    }
    const label = t(CREDIT_ROLE_LABELS.get(credit.role) ?? 'meta.credit')
    rows.push({
      label,
      detail: credit.raw && credit.raw !== label ? credit.raw : undefined,
      values: credit.names.map((name) => ({ text: name.text, language: name.language })),
    })
  }
  if (meta.duration !== undefined) {
    pushValue(t('meta.duration'), formatTime(meta.duration))
  }
  if (meta.offset !== 0) {
    pushValue(t('meta.offset'), `${meta.offset} ms`)
  }
  if (meta.language) {
    pushValue(t('meta.language'), meta.language)
  }
  if (meta.isrcs.length) {
    rows.push({
      label: 'ISRC',
      values: meta.isrcs.map((text) => ({ text })),
    })
  }
  // Repeated unknown keys describe one field, so they share a row instead of repeating the label.
  const unknowns = new Map<string, { text: string; language?: string }[]>()
  for (const item of meta.unknowns) {
    const values = unknowns.get(item.key)
    if (values) {
      values.push({ text: item.value })
    } else {
      unknowns.set(item.key, [{ text: item.value }])
    }
  }
  for (const [key, values] of unknowns) {
    rows.push({ label: key, values, raw: true })
  }
  return rows
})

const performers = computed(() => {
  return props.lyric.agents.map((agent) => {
    const name = agent.names.map((item) => item.text).join(' / ')
    // An unnamed agent falls back to its id, so the display marks it as an identifier rather than a name.
    return { text: name || agent.id, fallback: name === '' }
  })
})
</script>

<style module lang="scss">
.preview {
  min-width: 0;
}

.linesSection {
  container: lyrics / inline-size;
  min-width: 0;

  &:not(:first-child) {
    border-top: 1px solid var(--line);
  }
}

.lines {
  :global(.n-list-item) {
    padding: 14px var(--result-pad, 16px);
  }

  :global(.n-list-item__main) {
    min-width: 0;
    width: 100%;
  }
}

.noLines {
  margin: 0;
  padding: 18px var(--result-pad, 16px);
  color: var(--muted);
  font-size: 12px;
}

.header {
  min-width: 0;
  padding: 16px var(--result-pad, 16px);
  border-bottom: 1px solid var(--line);
}

.rows {
  --metadata-label-width: 120px;

  min-width: 0;

  :global(.n-descriptions-table) {
    width: 100%;
    table-layout: fixed;
  }

  :global(.n-descriptions-table-content__label) {
    overflow-wrap: anywhere;
  }

  :global(.n-descriptions-table-content__content) {
    min-width: 0;
  }
}

.detail {
  margin-left: 5px;
  font-size: 11px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.value {
  max-width: 100%;
  height: auto;
  min-height: 24px;

  :global(.n-tag__content) {
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
}

.identifier {
  font: 11px var(--mono);
}

@media (max-width: 480px) {
  .rows {
    --metadata-label-width: 90px;
  }
}
</style>
