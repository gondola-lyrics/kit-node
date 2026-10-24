<template>
  <div :class="[$style.root, { [$style.input]: scope === 'parse' }]">
    <div :class="$style.toolbar">
      <div :class="$style.tabs"><slot /></div>
      <div :class="$style.actions">
        <button
          v-if="format"
          type="button"
          :class="[$style.toggle, { [$style.toggleActive]: opened }]"
          :aria-expanded="opened"
          :aria-controls="`${id}-panel`"
          @click="opened = !opened"
        >
          <span>{{ title }}</span>
          <span v-if="changed" :class="$style.badge" :aria-label="`${t('settings.modified')}: ${changed}`">{{ changed }}</span>
          <svg :class="{ [$style.chevronOpen]: opened }" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </div>

    <section v-if="format && opened" :id="`${id}-panel`" :class="$style.panel" :aria-label="title">
      <button type="button" :class="$style.reset" :disabled="changed === 0" @click="resetOptions">{{ t('settings.reset') }}</button>

      <div v-if="scope === 'parse'" :class="$style.grid">
        <div v-if="format === 'lrc'" :class="$style.group">
          <label :class="$style.field" :for="`${id}-tolerance`">
            <span>{{ t('settings.annotationTolerance') }}</span>
            <span :class="$style.numberControl">
              <input
                :id="`${id}-tolerance`"
                v-model.number="options.parse.lrc.annotationTolerance"
                type="number"
                min="0"
                step="1"
                inputmode="numeric"
              />
              <span :class="$style.unit">ms</span>
            </span>
            <small>{{ t('settings.annotationToleranceHint') }}</small>
          </label>
        </div>
        <div v-if="format === 'ttml'" :class="$style.group">
          <label :class="$style.field" :for="`${id}-language`">
            <span>{{ t('settings.language') }}</span>
            <input
              :id="`${id}-language`"
              v-model="options.parse.ttml.language"
              type="text"
              placeholder="zh-CN, en…"
              spellcheck="false"
              autocapitalize="off"
            />
            <small>{{ t('settings.languageHint') }}</small>
          </label>
        </div>
      </div>

      <div v-else :class="$style.grid">
        <template v-if="format === 'lrc'">
          <label :class="$style.field" :for="`${id}-word-timing`">
            <span>{{ t('settings.wordTiming') }}</span>
            <select :id="`${id}-word-timing`" v-model="options.generate.lrc.wordTiming">
              <option value="angle">{{ t('settings.wordTimingAngle') }}</option>
              <option value="bracket">{{ t('settings.wordTimingBracket') }}</option>
              <option value="none">{{ t('settings.wordTimingNone') }}</option>
            </select>
            <small v-if="options.generate.lrc.wordTiming === 'bracket'">{{ t('settings.wordTimingBracketHint') }}</small>
          </label>
          <label :class="$style.field" :for="`${id}-time-format`">
            <span>{{ t('settings.timeFormat') }}</span>
            <input
              :id="`${id}-time-format`"
              v-model="options.generate.lrc.timeFormat"
              type="text"
              :list="`${id}-time-formats`"
              placeholder="mm:ss.SSS"
              spellcheck="false"
              autocapitalize="off"
            />
            <datalist :id="`${id}-time-formats`">
              <option v-for="pattern in timeFormats" :key="pattern" :value="pattern" />
            </datalist>
            <small>{{ t('settings.timeFormatHint') }}</small>
          </label>
          <div :class="$style.checks">
            <label :class="$style.check">
              <input v-model="options.generate.lrc.includeMeta" type="checkbox" />
              <span>{{ t('settings.includeMeta') }}</span>
            </label>
            <label :class="$style.check">
              <input v-model="options.generate.lrc.includeInstrumental" type="checkbox" />
              <span>{{ t('settings.includeInstrumental') }}</span>
            </label>
            <label :class="[$style.check, { [$style.disabled]: options.generate.lrc.wordTiming === 'none' }]">
              <input v-model="options.generate.lrc.includeWordEnd" type="checkbox" :disabled="options.generate.lrc.wordTiming === 'none'" />
              <span>{{ t('settings.includeWordEnd') }}</span>
            </label>
          </div>
        </template>
        <template v-else-if="format === 'ttml'">
          <label :class="$style.field" :for="`${id}-profile`">
            <span>{{ t('settings.profile') }}</span>
            <select :id="`${id}-profile`" v-model="options.generate.ttml.profile">
              <option value="auto">{{ t('settings.profileAuto') }}</option>
              <option value="amll">AMLL</option>
              <option value="itunes">iTunes</option>
            </select>
            <small>{{ t('settings.profileHint') }}</small>
          </label>
          <div :class="[$style.checks, $style.ttmlChecks]">
            <label :class="$style.check">
              <input v-model="options.generate.ttml.includeMeta" type="checkbox" />
              <span>{{ t('settings.includeMeta') }}</span>
            </label>
            <label :class="$style.check">
              <input v-model="options.generate.ttml.indent" type="checkbox" />
              <span>{{ t('settings.indent') }}</span>
            </label>
          </div>
        </template>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { LyricFormat } from '@gondola-lyrics/kit'
import type { PlaygroundOptions } from '../lib/options'

import { computed, ref } from 'vue'

import { useI18n } from '../composables/useI18n'
import { createOptions, getOptionOverrides } from '../lib/options'

const props = defineProps<{ id: string; scope: 'parse' | 'generate'; format: LyricFormat | null }>()
const options = defineModel<PlaygroundOptions>({ required: true })
const { t } = useI18n()
const opened = ref(false)
const timeFormats = ['mm:ss.SSS', 'mm:ss.SS', 'mm:ss', 'hh:mm:ss.SSS', 'ss.SSS']

const title = computed(() => {
  return t('settings.title')
})

const changed = computed(() => {
  const format = props.format
  if (!format) {
    return 0
  }
  return Object.keys(getOptionOverrides(options.value)?.[props.scope]?.[format] ?? {}).length
})

const resetOptions = () => {
  const initial = createOptions()
  if (props.scope === 'parse') {
    if (props.format === 'lrc') {
      options.value.parse.lrc = initial.parse.lrc
    } else if (props.format === 'ttml') {
      options.value.parse.ttml = initial.parse.ttml
    }
  } else if (props.format === 'lrc') {
    options.value.generate.lrc = initial.generate.lrc
  } else if (props.format === 'ttml') {
    options.value.generate.ttml = initial.generate.ttml
  }
}
</script>

<style module lang="scss">
.root {
  min-width: 0;
}

.input {
  margin-bottom: -14px;
  border: 1px solid var(--line);
  border-bottom: 0;
  border-radius: var(--radius) var(--radius) 0 0;
  background: var(--wash);

  .toolbar {
    border-bottom: 0;
    background: transparent;
  }
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 16px;
  padding: 0 14px;
  border-bottom: 1px solid var(--line);
  background: #fff;
}

.tabs {
  min-width: 0;
}

.actions {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  margin-left: auto;
}

.toggle,
.reset {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;

  &:hover {
    color: var(--primary-deep);
  }
}

.toggleActive {
  color: var(--primary-deep);
}

.toggle svg {
  flex-shrink: 0;
  transition: transform 120ms ease;
}

.chevronOpen {
  transform: rotate(180deg);
}

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 4px;
  background: var(--primary-soft);
  color: var(--primary-deep);
  font: 10px var(--mono);
}

.panel {
  position: relative;
  padding: 14px 14px 16px;
  border-bottom: 1px solid var(--line);
  background: #fcfdff;
}

.input .panel {
  border-top: 1px solid var(--line);
  border-bottom: 0;
}

.reset {
  position: absolute;
  top: 0;
  right: 14px;
  z-index: 1;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 24px;
}

.group {
  min-width: 0;
}

.field {
  display: flex;
  flex-direction: column;
  align-self: start;
  gap: 7px;
  min-width: 0;
  color: var(--text);
  font-size: 12px;

  /* Keep labels clear of the corner action without adding a separate header row. */
  > span:first-child {
    min-height: 24px;
    padding-right: 96px;
  }

  input,
  select {
    width: 100%;
    min-width: 0;
    min-height: 36px;
    padding: 7px 10px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: #fff;
    color: var(--text);
    font-size: 12px;
  }

  input {
    font-family: var(--mono);
  }

  small {
    color: var(--muted);
    font-size: 11px;
    line-height: 1.6;
  }
}

.numberControl {
  position: relative;

  input {
    padding-right: 46px;
  }
}

.unit {
  position: absolute;
  top: 50%;
  right: 27px;
  color: var(--muted);
  font: 11px var(--mono);
  transform: translateY(-50%);
  pointer-events: none;
}

.checks {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 24px;
}

.ttmlChecks {
  grid-column: auto;
  grid-template-columns: minmax(0, 1fr);
  align-self: end;
}

.check {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 44px;
  color: var(--text);
  font-size: 12px;
  cursor: pointer;

  input {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    margin: 0;
  }
}

.disabled {
  color: var(--muted);
  cursor: default;
}

@media (max-width: 820px) {
  .field input,
  .field select {
    min-height: 44px;
    font-size: 16px;
  }
}

@media (max-width: 640px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .ttmlChecks {
    grid-column: 1 / -1;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .toolbar {
    padding: 0 12px;
    column-gap: 12px;
  }

  .panel {
    padding: 14px 12px;
  }

  .reset {
    right: 12px;
  }

  .checks,
  .ttmlChecks {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
