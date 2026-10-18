<template>
  <div :class="[$style.lyricLine, { [$style.backgroundLine]: background }]">
    <div :class="$style.lineHeading">
      <span :class="$style.lineTime">{{ formatRange(line.time) }}</span>
      <span v-for="(performer, index) in performers" :key="index" :class="$style.performer">{{ performer }}</span>
      <span v-for="(language, index) in line.languages" :key="`language-${index}`" :class="$style.lineLanguage">{{ language }}</span>
    </div>

    <p v-if="instrumental" :class="$style.instrumental">{{ t('result.instrumental') }}</p>
    <div v-else-if="words.length" :class="$style.words">
      <template v-for="(word, index) in words" :key="index">
        <span v-if="word.type === WordType.SPACE" :class="$style.wordSpace">{{ word.text }}</span>
        <span v-else :class="[$style.word, { [$style.timed]: word.timed, [$style.emphasized]: word.emphasized }]" :title="word.title">
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
      <p v-for="(item, index) in line.annotation?.romans" :key="`roman-${index}`" :class="$style.lineRoman" :title="item.language">{{ item.text }}</p>
      <p v-for="(item, index) in line.annotation?.translations" :key="`translation-${index}`" :title="item.language">{{ item.text }}</p>
    </div>

    <div v-if="backgrounds.length" :class="$style.backgrounds">
      <h4>{{ t('result.background') }}</h4>
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
    return (
      agent.names
        .map((name) => {
          return name.text
        })
        .join(' / ') || agent.id
    )
  })
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
      timed: word.time !== undefined,
      emphasized: word.emphasis?.value ?? false,
      title: [formatRange(word.time), word.language].filter(Boolean).join(' · '),
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
  min-width: 0;
}

.lineHeading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  margin-bottom: 6px;
}

.lineTime {
  color: var(--muted);
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.02em;
  line-height: 1.6;
}

.performer {
  padding: 1px 7px;
  border: 1px solid var(--primary-soft);
  border-radius: 3px;
  color: var(--primary-deep);
  font-size: 10px;
  overflow-wrap: anywhere;
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
  line-height: 1.9;
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

  &.timed {
    .wordText {
      border-bottom-color: var(--line);
      border-bottom-style: dotted;
    }

    &:hover .wordText {
      border-radius: 2px;
      background: var(--primary-soft);
    }
  }

  &.emphasized .wordText {
    color: var(--primary-deep);
    font-weight: 700;
  }
}

.wordText {
  border-bottom: 1px solid transparent;
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

.instrumental {
  padding: 6px 10px;
  border-left: 2px solid var(--line);
  color: var(--muted);
  font-size: 13px;
  line-height: 1.8;
}

.lineAnnotations {
  display: grid;
  gap: 3px;
  margin-top: 6px;
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
  display: grid;
  gap: 12px;
  margin-top: 12px;
  padding-left: 14px;
  border-left: 2px solid var(--line);

  h4 {
    margin: 0;
    color: var(--muted);
    font-size: 11px;
    font-weight: 500;
  }
}

.backgroundLine {
  .plainText,
  .words {
    font-size: 13px;
  }
}
</style>
