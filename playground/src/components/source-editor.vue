<template>
  <section :class="$style.section" aria-labelledby="input-heading">
    <NH2 id="input-heading" :class="$style.heading">{{ t('input.title') }}</NH2>
    <NCard :class="$style.card" :content-style="{ padding: 0 }">
      <OptionsPanel id="parse-options" v-model="form.options" scope="parse" :format="format">
        <ControlTabs v-model="form.mode" :items="modes" :label="t('settings.mode')" />
      </OptionsPanel>

      <div :id="'input-' + form.mode" role="tabpanel" :aria-labelledby="'mode-' + form.mode">
        <NInput
          :key="form.mode"
          v-model:value="content"
          :class="$style.editor"
          :placeholder="placeholder"
          type="textarea"
          :rows="10"
          :bordered="false"
          :theme-overrides="{ borderRadius: '0' }"
          :input-props="{ ...editorProps, id: 'lyrics-input-' + form.mode, 'aria-label': t('input.label') }"
        />
        <div v-if="form.mode === 'lrc' || form.mode === 'qrc' || form.mode === 'yrc'" :class="$style.tracks">
          <NFormItem
            v-for="track in tracks"
            :key="track.key"
            :class="$style.track"
            :label="track.label"
            :label-props="{ for: 'lyrics-input-' + track.key }"
            :show-feedback="false"
          >
            <NInput
              v-model:value="form[track.key]"
              :placeholder="track.placeholder"
              type="textarea"
              :rows="5"
              :input-props="{ ...editorProps, id: 'lyrics-input-' + track.key }"
            />
          </NFormItem>
        </div>
      </div>
    </NCard>
    <NAlert v-if="!storageAvailable" type="warning" :show-icon="false" role="status">{{ t('input.storage') }}</NAlert>
  </section>
</template>

<script setup lang="ts">
import type { PlaygroundForm } from '../lib/playground'

import { NAlert, NCard, NFormItem, NH2, NInput } from 'naive-ui'
import { computed } from 'vue'

import { detectFormat } from '@gondola-lyrics/kit'

import { useI18n } from '../composables/useI18n'
import { SOURCE_CONTENT_KEYS } from '../lib/playground'

import OptionsPanel from './options-panel.vue'
import ControlTabs from './control-tabs.vue'

const props = defineProps<{ form: PlaygroundForm; storageAvailable: boolean }>()
const { t } = useI18n()
const editorProps = {
  spellcheck: false,
  autocomplete: 'off',
  autocapitalize: 'off',
  style: { fontFamily: 'var(--mono)', fontSize: '12px', lineHeight: '1.9', tabSize: 2 },
}
const content = computed({
  get: () => {
    return props.form[SOURCE_CONTENT_KEYS[props.form.mode]]
  },
  set: (value: string) => {
    props.form[SOURCE_CONTENT_KEYS[props.form.mode]] = value
  },
})
const format = computed(() => {
  return props.form.mode === 'auto' ? (detectFormat(content.value) ?? null) : props.form.mode
})
const placeholder = computed(() => {
  if (props.form.mode === 'qrc') {
    return t('input.qrcPlaceholder')
  }
  if (props.form.mode === 'yrc') {
    return t('input.yrcPlaceholder')
  }
  if (props.form.mode === 'krc') {
    return t('input.krcPlaceholder')
  }
  if (props.form.mode === 'kwrc') {
    return t('input.kwrcPlaceholder')
  }
  return t('input.placeholder')
})
const modes = computed(() => {
  return [
    { value: 'auto' as const, label: t('settings.auto'), id: 'mode-auto', controls: 'input-auto' },
    { value: 'lrc' as const, label: 'LRC', id: 'mode-lrc', controls: 'input-lrc' },
    { value: 'qrc' as const, label: 'QRC', id: 'mode-qrc', controls: 'input-qrc' },
    { value: 'yrc' as const, label: 'YRC', id: 'mode-yrc', controls: 'input-yrc' },
    { value: 'krc' as const, label: 'KRC', id: 'mode-krc', controls: 'input-krc' },
    { value: 'kwrc' as const, label: 'KWRC', id: 'mode-kwrc', controls: 'input-kwrc' },
    { value: 'ttml' as const, label: 'TTML', id: 'mode-ttml', controls: 'input-ttml' },
  ]
})
const tracks = computed(() => {
  if (props.form.mode === 'yrc') {
    return [
      { key: 'yrcTranslations' as const, label: t('input.translations'), placeholder: t('input.yrcTranslationsPlaceholder') },
      { key: 'yrcRomans' as const, label: t('input.romans'), placeholder: t('input.yrcRomansPlaceholder') },
    ]
  }
  return [
    { key: 'translations' as const, label: t('input.translations'), placeholder: '' },
    { key: 'romans' as const, label: t('input.romans'), placeholder: '' },
  ]
})
</script>

<style module lang="scss">
.section {
  display: grid;
  align-content: start;
  gap: 12px;
  min-width: 0;
}

.heading {
  margin: 0;
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
}

.card {
  min-width: 0;
  overflow: hidden;
}

.editor {
  width: 100%;

  :global(textarea) {
    min-height: 260px;
    padding: 16px;
  }
}

.tracks {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  padding: 16px;
  border-top: 1px solid var(--line);
}

.track {
  min-width: 0;
}

@media (max-width: 520px) {
  .tracks {
    grid-template-columns: minmax(0, 1fr);
  }

  .editor :global(textarea) {
    padding: 12px;
  }

  .tracks {
    padding: 12px;
  }
}
</style>
