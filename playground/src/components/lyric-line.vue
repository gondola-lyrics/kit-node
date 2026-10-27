<template>
  <div :class="[$style.lyricLine, { [$style.withMeta]: hasMeta, [$style.backgroundLine]: background }]">
    <div v-if="hasMeta" :class="$style.lineMeta">
      <span v-if="background" :class="$style.backgroundLabel">{{ t('result.background') }}</span>
      <span v-if="line.time" :class="$style.lineTime">{{ formatRange(line.time) }}</span>
      <div v-if="performers.length || line.languages.length" :class="$style.lineDetails">
        <span v-for="(performer, index) in performers" :key="index" :class="[$style.performer, { [$style.identifier]: performer.fallback }]">{{
          performer.text
        }}</span>
        <span v-for="(language, index) in line.languages" :key="`language-${index}`" :class="$style.lineLanguage">{{ language }}</span>
      </div>
    </div>
    <div :class="$style.lineBody">
      <p v-if="instrumental" :class="$style.instrumental">{{ t('result.instrumental') }}</p>
      <div v-else-if="words.length" :class="$style.words">
        <template v-for="(word, index) in words" :key="index">
          <span v-if="word.type === WordType.SPACE" :class="$style.wordSpace">{{ word.text }}</span>
          <span v-else :class="[$style.word, { [$style.emphasized]: word.emphasized }]" :title="word.title">
            <span v-for="(item, itemIndex) in word.rubies" :key="`ruby-${itemIndex}`" :class="$style.wordRuby" :title="item.title">{{
              item.text
            }}</span>
            <span v-for="(item, itemIndex) in word.romans" :key="`roman-${itemIndex}`" :class="$style.wordRoman" :title="item.title">{{
              item.text
            }}</span>
            <span
              v-for="(item, itemIndex) in word.translations"
              :key="`translation-${itemIndex}`"
              :class="$style.wordTranslation"
              :title="item.language"
              >{{ item.text }}</span
            >
            <span :class="$style.wordText">{{ word.text }}</span>
          </span>
        </template>
      </div>
      <p v-else-if="text" :class="$style.plainText">{{ text }}</p>
      <p v-else :class="$style.emptyLine">{{ t('result.emptyLine') }}</p>

      <div v-if="line.annotation?.romans.length || line.annotation?.translations.length" :class="$style.lineAnnotations">
        <p v-for="(item, index) in line.annotation?.romans" :key="`roman-${index}`" :class="$style.lineRoman" :title="item.language">
          {{ item.text }}
        </p>
        <p v-for="(item, index) in line.annotation?.translations" :key="`translation-${index}`" :title="item.language">{{ item.text }}</p>
      </div>
    </div>
    <div v-if="backgrounds.length" :class="$style.backgrounds">
      <LyricLine v-for="(item, index) in backgrounds" :key="index" :line="item" :agents="agents" background />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Agent, Line, LineBackground, WordAnnotationRoman, WordAnnotationRuby } from '@gondola-lyrics/model/runtime'

import { LineType, WordType, getAnnotationItemText, getContentText, resolveLineAgents } from '@gondola-lyrics/model/runtime'
import { computed } from 'vue'

import { useI18n } from '../composables/useI18n'
import { formatRange } from '../lib/format'

defineOptions({ name: 'LyricLine' })

const props = defineProps<{
  line: Line | LineBackground
  agents: Agent[]
  background?: boolean
}>()

const { t } = useI18n()

const instrumental = computed(() => {
  return 'type' in props.line && props.line.type === LineType.INSTRUMENTAL
})

const text = computed(() => {
  return getContentText(props.line.content)
})

const performers = computed(() => {
  return resolveLineAgents(props.line, props.agents).map((agent) => {
    const name = agent.names
      .map((item) => {
        return item.text
      })
      .join(' / ')
    // An unnamed agent falls back to its id, so the display marks it as an identifier rather than a name.
    return { text: name || agent.id, fallback: name === '' }
  })
})

const hasMeta = computed(() => {
  return Boolean(props.line.time || props.background || performers.value.length || props.line.languages.length)
})

const annotation = (item: WordAnnotationRoman | WordAnnotationRuby) => {
  const details: string[] = []
  if (item.language) {
    details.push(item.language)
  }
  if (item.time) {
    details.push(formatRange(item.time))
  }
  return { text: getAnnotationItemText(item), title: details.join(' · ') }
}

const words = computed(() => {
  return (props.line.content?.words ?? []).map((word) => {
    return {
      type: word.type,
      text: word.text,
      emphasized: word.emphasis?.value ?? false,
      title: [word.time ? formatRange(word.time) : undefined, word.language].filter(Boolean).join(' · '),
      rubies: (word.annotation?.rubies ?? []).map(annotation),
      romans: (word.annotation?.romans ?? []).map(annotation),
      translations: word.annotation?.translations ?? [],
    }
  })
})

const backgrounds = computed(() => {
  return 'backgrounds' in props.line ? props.line.backgrounds : []
})
</script>

<style module lang="scss">
.lyricLine {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  row-gap: 6px;
  min-width: 0;
}

.lineBody {
  min-width: 0;
}

.lineMeta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 12px;
  min-width: 0;
  color: var(--muted);
}

.lineDetails {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 10px;
  min-width: 0;
  max-width: 100%;
  line-height: 1.5;
}

.lineTime {
  color: var(--muted);
  font: 10.5px / 1.7 var(--mono);
  font-variant-numeric: tabular-nums;
  white-space: normal;
}

.performer {
  max-width: 100%;
  padding: 1px 7px;
  border: 1px solid var(--line);
  border-radius: 3px;
  background: var(--wash);
  color: var(--primary-deep);
  font-size: 10.5px;
  overflow-wrap: anywhere;
}

.identifier {
  color: var(--muted);
  font: 10px var(--mono);
}

.backgroundLabel {
  color: var(--muted);
  font-family: var(--mono);
  font-size: 9.5px;
  letter-spacing: 0.12em;
  line-height: 1.5;
  text-transform: uppercase;
}

.lineLanguage {
  color: var(--muted);
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.08em;
}

.plainText,
.words {
  color: var(--text);
  font-size: 15px;
  line-height: 1.8;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.plainText,
.emptyLine,
.instrumental {
  margin: 0;
}

.word {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  vertical-align: bottom;
  max-width: 100%;

  &.emphasized .wordText {
    color: var(--primary-deep);
    font-weight: 700;
  }
}

.wordSpace {
  white-space: pre-wrap;
}

.wordRuby,
.wordRoman,
.wordTranslation {
  font-size: 10px;
  font-weight: 400;
  line-height: 1.5;
}

.wordRuby {
  color: var(--primary);
}

.wordRoman,
.wordTranslation {
  color: var(--muted);
}

.wordRoman,
.lineRoman {
  font-style: italic;
}

.emptyLine,
.instrumental {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.8;
}

.lineAnnotations {
  display: grid;
  gap: 3px;
  margin-top: 4px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
  white-space: pre-wrap;

  p {
    margin: 0;
  }
}

.backgrounds {
  grid-column: 1 / -1;
  display: grid;
  gap: 8px;
  margin-top: 4px;
  padding-left: 12px;
  border-left: 1px solid var(--line);
}

.backgroundLine {
  .plainText,
  .words {
    font-size: 13px;
  }

  .lineAnnotations {
    font-size: 12px;
  }
}

@container lyrics (min-width: 640px) {
  .withMeta {
    grid-template-columns: 132px minmax(0, 1fr);
    column-gap: 16px;
    align-items: start;
  }

  .lineMeta {
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    padding-top: 4px;
  }
}
</style>
