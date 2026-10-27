<template>
  <section :class="$style.section" aria-labelledby="input-heading">
    <h2 id="input-heading" :class="$style.heading">{{ t('input.title') }}</h2>
    <div :class="$style.card">
      <OptionsPanel id="parse-options" v-model="form.options" scope="parse" :format="form.mode === 'auto' ? null : form.mode">
        <ControlTabs v-model="form.mode" :items="modes" :label="t('settings.mode')" />
      </OptionsPanel>

      <div :id="'input-' + form.mode" role="tabpanel" :aria-labelledby="'mode-' + form.mode">
        <label :class="$style.visuallyHidden" :for="'lyrics-input-' + form.mode">{{ t('input.label') }}</label>
        <textarea
          :key="form.mode"
          :id="'lyrics-input-' + form.mode"
          v-model="content"
          :class="$style.editor"
          :placeholder="t('input.placeholder')"
          spellcheck="false"
          autocomplete="off"
          autocapitalize="off"
        ></textarea>
        <div v-if="form.mode === 'lrc'" :class="$style.tracks">
          <div v-for="track in tracks" :key="track.key" :class="$style.track">
            <label :class="$style.trackLabel" :for="'lyrics-input-' + track.key">{{ track.label }}</label>
            <textarea
              :id="'lyrics-input-' + track.key"
              v-model="form[track.key]"
              :class="[$style.editor, $style.trackEditor]"
              spellcheck="false"
              autocomplete="off"
              autocapitalize="off"
            ></textarea>
          </div>
        </div>
      </div>
    </div>
    <p v-if="!storageAvailable" :class="$style.warning" role="status">{{ t('input.storage') }}</p>
  </section>
</template>

<script setup lang="ts">
import type { PlaygroundForm, SourceMode } from '../lib/playground'

import { computed } from 'vue'

import { useI18n } from '../composables/useI18n'

import OptionsPanel from './options-panel.vue'
import ControlTabs from './control-tabs.vue'

const props = defineProps<{ form: PlaygroundForm; storageAvailable: boolean }>()
const { t } = useI18n()
const contentKeys: Record<SourceMode, 'autoContent' | 'lrcContent' | 'ttmlContent'> = {
  auto: 'autoContent',
  lrc: 'lrcContent',
  ttml: 'ttmlContent',
}

const content = computed({
  get: () => {
    return props.form[contentKeys[props.form.mode]]
  },
  set: (value: string) => {
    props.form[contentKeys[props.form.mode]] = value
  },
})
const modes = computed(() => {
  return [
    { value: 'auto' as const, label: t('settings.auto'), id: 'mode-auto', controls: 'input-auto' },
    { value: 'lrc' as const, label: 'LRC', id: 'mode-lrc', controls: 'input-lrc' },
    { value: 'ttml' as const, label: 'TTML', id: 'mode-ttml', controls: 'input-ttml' },
  ]
})
const tracks = computed(() => {
  return [
    { key: 'translations' as const, label: t('input.translations') },
    { key: 'romans' as const, label: t('input.romans') },
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
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: #fff;
}

.editor {
  display: block;
  width: 100%;
  min-height: 260px;
  padding: 18px;
  resize: vertical;
  border: 0;
  background: #fcfdff;
  color: #1c3b54;
  font: 12px / 1.9 var(--mono);
  tab-size: 2;

  &:focus-visible {
    outline: 0;
    box-shadow: inset 0 0 0 2px rgb(43 127 174 / 24%);
  }

  &::placeholder {
    color: #91a4b4;
  }
}

.tracks {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-top: 1px solid var(--line);
}

.track {
  min-width: 0;
  background: #fcfdff;

  + .track {
    border-left: 1px solid var(--line);
  }
}

.trackLabel {
  display: block;
  padding: 12px 18px 0;
  color: var(--muted);
  font-size: 11px;
}

.trackEditor {
  min-height: 130px;
  resize: none;
}

.visuallyHidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (max-width: 820px) {
  .editor {
    padding: 14px;
    line-height: 1.7;
  }
}

@media (max-width: 520px) {
  .tracks {
    grid-template-columns: minmax(0, 1fr);
  }

  .track + .track {
    border-top: 1px solid var(--line);
    border-left: 0;
  }

  .editor {
    min-height: 220px;
    padding: 14px 12px;
  }

  .trackEditor {
    min-height: 110px;
  }

  .trackLabel {
    padding-inline: 12px;
  }
}

.warning {
  margin: 0;
  padding: 12px 16px;
  border: 1px solid #ebdfc8;
  border-radius: var(--radius);
  background: #fffbf3;
  color: #805d25;
  font-size: 12px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
</style>
