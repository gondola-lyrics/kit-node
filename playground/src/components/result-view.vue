<template>
  <div :class="$style.resultView">
    <section v-if="metadata.length">
      <h3>{{ t('result.metadata') }}</h3>
      <dl :class="$style.metadata">
        <template v-for="(row, index) in metadata" :key="index">
          <dt :class="{ [$style.raw]: row.raw }">{{ row.label }}</dt>
          <dd>
            <span v-for="(value, valueIndex) in row.values" :key="valueIndex" :class="$style.metaValue" :title="value.language">{{
              value.text
            }}</span>
          </dd>
        </template>
      </dl>
    </section>

    <section v-if="lyric.languages.length || performers.length" :class="$style.details">
      <div v-if="lyric.languages.length">
        <h3>{{ t('result.languages') }}</h3>
        <div :class="$style.chips">
          <span v-for="(language, index) in lyric.languages" :key="index" :class="$style.chip">
            <span :class="$style.languageTag">{{ language.tag }}</span>
            <span :class="$style.coverage">{{ language.count }} {{ t('result.lineUnit') }}</span>
          </span>
        </div>
      </div>
      <div v-if="performers.length">
        <h3>{{ t('result.agents') }}</h3>
        <div :class="$style.chips">
          <span v-for="(performer, index) in performers" :key="index" :class="$style.chip">{{ performer }}</span>
        </div>
      </div>
    </section>

    <section :class="$style.linesSection">
      <p v-if="!lyric.lines.length" :class="$style.noLines">{{ t('result.noLines') }}</p>
      <ol v-else :class="$style.lines" :aria-label="t('result.lines')">
        <li v-for="(line, index) in lyric.lines" :key="index">
          <span :class="$style.lineNumber" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
          <LyricLine :line="line" :agents="lyric.agents" />
        </li>
      </ol>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { Lyric, Text } from '@gondola-lyrics/model/runtime'
import type { MessageKey } from '../composables/useI18n'

import { computed } from 'vue'

import { useI18n } from '../composables/useI18n'
import { formatTime } from '../lib/format'

import LyricLine from './lyric-line.vue'

interface MetadataRow {
  label: string
  values: { text: string; language?: string }[]
  raw?: boolean
}

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
      values: values.map((value) => {
        return { text: value.text, language: value.language }
      }),
    })
  }
  const pushValue = (label: string, text: string, raw = false) => {
    rows.push({ label, values: [{ text }], raw })
  }

  pushTexts('meta.title', meta.titles)
  pushTexts('meta.artist', meta.artists)
  pushTexts('meta.album', meta.albums)
  pushTexts('meta.author', meta.authors)
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
      values: meta.isrcs.map((text) => {
        return { text }
      }),
    })
  }
  for (const item of meta.unknowns) {
    pushValue(item.key, item.value, true)
  }
  return rows
})

const performers = computed(() => {
  return props.lyric.agents.map((agent) => {
    return (
      agent.names
        .map((name) => {
          return name.text
        })
        .join(' / ') || agent.id
    )
  })
})
</script>

<style module lang="scss">
.resultView {
  display: grid;
  gap: 26px;
  min-width: 0;

  section + section {
    padding-top: 24px;
    border-top: 1px solid var(--line);
  }

  h3 {
    margin: 0 0 14px;
    color: var(--muted);
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
}

.metadata {
  display: grid;
  grid-template-columns: minmax(72px, 128px) minmax(0, 1fr);
  gap: 9px 20px;
  margin: 0;
  font-size: 13px;
  line-height: 1.6;

  dt {
    padding: 2px 0;
    color: var(--muted);
    overflow-wrap: anywhere;

    &.raw {
      font-family: var(--mono);
      font-size: 11px;
    }
  }

  dd {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    min-width: 0;
    margin: 0;
  }
}

.metaValue {
  max-width: 100%;
  color: var(--text);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.details {
  display: grid;
  gap: 20px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.chip {
  display: inline-flex;
  align-items: baseline;
  gap: 9px;
  max-width: 100%;
  padding: 5px 10px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--wash);
  color: var(--text);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.languageTag {
  color: var(--primary-deep);
  font-family: var(--mono);
}

.coverage {
  color: var(--muted);
  font-family: var(--mono);
  font-size: 11px;
  white-space: nowrap;
}

.noLines {
  margin: 0;
  padding: 22px 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}

.linesSection {
  padding-top: 0;
  border-top: 0;
}

.lines {
  margin: 0;
  padding: 0;
  list-style: none;

  > li {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    gap: 12px;
    margin: 0 -14px;
    padding: 16px 14px;

    + li {
      border-top: 1px solid var(--line);
    }
  }
}

.lineNumber {
  align-self: center;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.06em;
  line-height: 1.6;
}

@media (max-width: 480px) {
  .metadata {
    grid-template-columns: minmax(60px, 84px) minmax(0, 1fr);
    column-gap: 12px;
  }

  .lines > li {
    grid-template-columns: 24px minmax(0, 1fr);
    gap: 6px;
    margin: 0 -12px;
    padding: 14px 12px;
  }
}
</style>
