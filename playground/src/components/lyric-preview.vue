<template>
  <div :class="$style.preview">
    <section v-if="lyric.format || metadata.length || lyric.languages.length || performers.length" :class="$style.header">
      <dl :class="$style.rows">
        <template v-if="lyric.format">
          <dt>{{ t('result.format') }}</dt>
          <dd>
            <span :class="$style.value">{{ lyric.format }}</span>
          </dd>
        </template>
        <template v-if="lyric.languages.length">
          <dt :class="{ [$style.sectionStart]: lyric.format }">{{ t('result.languages') }}</dt>
          <dd :class="{ [$style.sectionStart]: lyric.format }">
            <span v-for="(language, index) in lyric.languages" :key="index" :class="$style.value">
              <span :class="$style.tag">{{ language.tag }}</span>
              <span :class="$style.coverage">{{ language.count }} {{ t('result.lineUnit') }}</span>
            </span>
          </dd>
        </template>
        <template v-if="performers.length">
          <dt :class="[$style.sectionStart, { [$style.aligned]: !lyric.format && !lyric.languages.length }]">{{ t('result.agents') }}</dt>
          <dd :class="[$style.sectionStart, { [$style.aligned]: !lyric.format && !lyric.languages.length }]">
            <span v-for="(performer, index) in performers" :key="index" :class="[$style.value, { [$style.identifier]: performer.fallback }]">{{
              performer.text
            }}</span>
          </dd>
        </template>
        <template v-for="(row, index) in metadata" :key="index">
          <dt :class="[{ [$style.raw]: row.raw }, { [$style.sectionStart]: index === 0 && hasLeadingRows }]">
            {{ row.label }}
            <span v-if="row.detail" :class="$style.detail">{{ row.detail }}</span>
          </dt>
          <dd :class="{ [$style.sectionStart]: index === 0 && hasLeadingRows }">
            <span v-for="(value, valueIndex) in row.values" :key="valueIndex" :class="$style.value" :title="value.language">{{ value.text }}</span>
          </dd>
        </template>
      </dl>
    </section>
    <section :class="$style.linesSection">
      <p v-if="!lyric.lines.length" :class="$style.noLines">{{ t('result.noLines') }}</p>
      <ol v-else :class="$style.lines" :aria-label="t('result.lines')">
        <li v-for="(line, index) in lyric.lines" :key="index">
          <LyricLine :line="line" :agents="lyric.agents" />
        </li>
      </ol>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { Lyric, Text } from '@gondola-lyrics/model/runtime'
import type { MessageKey } from '../composables/useI18n'

import { CreditRole } from '@gondola-lyrics/model/runtime'
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
  [CreditRole.MIXER, 'meta.creditMixer'],
  [CreditRole.MASTERING, 'meta.creditMastering'],
])

const props = defineProps<{ lyric: Lyric }>()
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
const hasLeadingRows = computed(() => {
  return Boolean(props.lyric.format) || props.lyric.languages.length > 0 || performers.value.length > 0
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
  margin: 0;
  padding: 0;
  list-style: none;

  > li {
    padding: 14px var(--result-pad, 16px);

    + li {
      border-top: 1px solid var(--line);
    }
  }
}

.noLines {
  margin: 0;
  padding: 18px var(--result-pad, 16px);
  color: var(--muted);
  font-size: 12px;
}

/* One key-value sheet: metadata first, then languages and performers as further sections. */
.header {
  min-width: 0;
  padding: 16px var(--result-pad, 16px);
  border-bottom: 1px solid var(--line);
}

.rows {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: baseline;
  gap: 7px 20px;
  min-width: 0;
  margin: 0;
  font-size: 12.5px;
  line-height: 1.6;

  dt {
    color: var(--muted);
    white-space: nowrap;

    &.raw {
      font: 11px var(--mono);
    }
  }

  dd {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
    min-width: 0;
    margin: 0;
    color: var(--text);
  }
}

/* A later section keeps its label aligned but leaves more room before it. */
.sectionStart {
  padding-top: 14px;
}

/* The first row of the sheet needs no leading space. */
.aligned {
  padding-top: 0;
}

.detail {
  display: block;
  max-width: 160px;
  margin-top: 2px;
  font-size: 11px;
  line-height: 1.4;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.value {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  max-width: 100%;
  padding: 3px 9px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--wash);
  color: var(--text);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.identifier {
  font: 11px var(--mono);
}

.tag {
  color: var(--primary-deep);
  font-family: var(--mono);
}

.coverage {
  color: var(--muted);
  font-family: var(--mono);
  font-size: 11px;
  white-space: nowrap;
}

@media (max-width: 480px) {
  .rows {
    gap: 6px 12px;
  }
}
</style>
