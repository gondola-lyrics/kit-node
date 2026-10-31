<template>
  <div :class="[$style.root, { [$style.source]: scope === 'parse' }]">
    <div :class="$style.toolbar">
      <div :class="$style.tabs">
        <slot />
      </div>
      <button
        v-if="available"
        type="button"
        :class="[$style.toggle, { [$style.active]: opened }]"
        :aria-expanded="opened"
        :aria-controls="id + '-panel'"
        @click="opened = !opened"
      >
        <span>{{ t('settings.title') }}</span>
        <span v-if="changed" :class="$style.badge" :aria-label="t('settings.modified') + ': ' + changed">{{ changed }}</span>
        <svg :class="{ [$style.open]: opened }" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>
    <section v-if="available && opened" :id="id + '-panel'" :class="$style.panel" :aria-label="t('settings.title')">
      <button v-if="scope === 'parse'" type="button" :class="$style.panelReset" :disabled="changed === 0" @click="resetParse">
        {{ t('settings.reset') }}
      </button>
      <div :class="$style.content">
        <template v-if="scope === 'parse'">
          <div :class="$style.parse">
            <NumberField
              v-if="format === 'lrc'"
              :id="id + '-tolerance'"
              v-model="options.parse.lrc.annotationTolerance"
              :label="t('settings.annotationTolerance')"
              :hint="t('settings.annotationToleranceHint')"
              :integer="false"
              :default-value="defaults.parse.lrc.annotationTolerance"
            />
            <div v-else-if="format === 'ttml'" :class="$style.field">
              <label :for="id + '-language'">{{ t('settings.language') }}</label>
              <input
                :id="id + '-language'"
                v-model="options.parse.ttml.language"
                type="text"
                placeholder="zh-CN, en…"
                spellcheck="false"
                autocapitalize="off"
                :aria-describedby="id + '-language-hint'"
              />
              <small :id="id + '-language-hint'">{{ t('settings.languageHint') }}</small>
            </div>
          </div>
        </template>
        <template v-else>
          <section :class="$style.section" :aria-labelledby="id + '-transforms-title'">
            <div :class="$style.header">
              <h3 :id="id + '-transforms-title'" :class="$style.heading">{{ t('settings.transforms') }}</h3>
              <button
                :id="id + '-transforms-reset'"
                type="button"
                :class="$style.reset"
                :disabled="transformChanges === 0"
                :aria-label="t('settings.transforms') + ' · ' + t('settings.reset')"
                @click="resetTransforms"
              >
                {{ t('settings.reset') }}
              </button>
            </div>
            <div :class="$style.operation">
              <label :class="$style.check">
                <input :id="id + '-credits'" v-model="options.transforms.credits.enabled" type="checkbox" />
                <span>{{ t('settings.extractCredits') }}</span>
              </label>
              <div v-if="options.transforms.credits.enabled" :class="$style.fields">
                <label :class="$style.check">
                  <input
                    :id="id + '-credit-source-lines'"
                    v-model="options.transforms.credits.removeSourceLines"
                    type="checkbox"
                    :aria-describedby="id + '-credit-removal-hint'"
                  />
                  <span>{{ t('settings.removeCreditLines') }}</span>
                </label>
                <div :class="[$style.field, $style.creditSeparators]">
                  <label :for="id + '-credit-name-separators'">{{ t('settings.creditNameSeparators') }}</label>
                  <textarea
                    :id="id + '-credit-name-separators'"
                    v-model="creditNameSeparators"
                    rows="3"
                    spellcheck="false"
                    autocomplete="off"
                    autocapitalize="off"
                    :aria-describedby="id + '-credit-separators-hint'"
                    @input="updateCreditSeparators"
                    @blur="creditNameSeparators = options.transforms.credits.nameSeparators.join('\n')"
                  ></textarea>
                  <small :id="id + '-credit-separators-hint'">{{ t('settings.creditNameSeparatorsHint') }}</small>
                </div>
                <small :id="id + '-credit-removal-hint'" :class="$style.hint">{{ t('settings.removeCreditLinesHint') }}</small>
              </div>
            </div>
            <div :class="$style.operation">
              <label :class="$style.check">
                <input :id="id + '-instrumental'" v-model="options.transforms.instrumental.enabled" type="checkbox" />
                <span>{{ t('settings.insertInstrumental') }}</span>
              </label>
              <div v-if="options.transforms.instrumental.enabled" :class="$style.fields">
                <NumberField
                  :id="id + '-min-intro-duration'"
                  v-model="options.transforms.instrumental.minIntroDuration"
                  :label="t('settings.minIntroDuration')"
                  :default-value="defaults.transforms.instrumental.minIntroDuration"
                />
                <NumberField
                  :id="id + '-min-duration'"
                  v-model="options.transforms.instrumental.minDuration"
                  :label="t('settings.minDuration')"
                  :default-value="defaults.transforms.instrumental.minDuration"
                />
                <NumberField
                  :id="id + '-end-time'"
                  v-model="options.transforms.instrumental.endTime"
                  :label="t('settings.endTime')"
                  :hint="t('settings.endTimeHint')"
                  :placeholder="t('settings.endTimePlaceholder')"
                  :max="2147483647"
                  @clear="options.transforms.instrumental.endTime = undefined"
                />
              </div>
            </div>
            <div :class="$style.operation">
              <label :class="$style.check">
                <input :id="id + '-emphasis'" v-model="options.transforms.emphasis.enabled" type="checkbox" />
                <span>{{ t('settings.emphasis') }}</span>
              </label>
              <NumberField
                v-if="options.transforms.emphasis.enabled"
                :id="id + '-duration-threshold'"
                v-model="options.transforms.emphasis.durationThreshold"
                :class="$style.emphasis"
                :label="t('settings.durationThreshold')"
                :hint="t('settings.emphasisHint')"
                :default-value="defaults.transforms.emphasis.durationThreshold"
              />
            </div>
            <div :class="$style.operation">
              <label :class="$style.check">
                <input :id="id + '-extract'" v-model="options.transforms.extract.enabled" type="checkbox" />
                <span>{{ t('settings.extractBackground') }}</span>
              </label>
              <div v-if="options.transforms.extract.enabled" :class="$style.fields">
                <label :class="$style.check">
                  <input :id="id + '-extract-full-line'" v-model="options.transforms.extract.fullLine" type="checkbox" />
                  <span>{{ t('settings.extractFullLine') }}</span>
                </label>
                <label :class="$style.check">
                  <input :id="id + '-extract-in-line'" v-model="options.transforms.extract.inLine" type="checkbox" />
                  <span>{{ t('settings.extractInLine') }}</span>
                </label>
                <label :class="$style.check">
                  <input :id="id + '-extract-cross-line'" v-model="options.transforms.extract.crossLine" type="checkbox" />
                  <span>{{ t('settings.extractCrossLine') }}</span>
                </label>
                <small :class="$style.hint">{{ t('settings.extractHint') }}</small>
              </div>
            </div>
            <div :class="$style.operation">
              <label :class="$style.check">
                <input :id="id + '-strip-brackets'" v-model="options.transforms.brackets.enabled" type="checkbox" />
                <span>{{ t('settings.stripBrackets') }}</span>
              </label>
              <small v-if="options.transforms.brackets.enabled" :class="[$style.hint, $style.operationHint]">{{
                t('settings.stripBracketsHint')
              }}</small>
            </div>
            <div :class="$style.operation">
              <label :class="$style.check">
                <input :id="id + '-insert-spaces'" v-model="options.transforms.spaces.enabled" type="checkbox" />
                <span>{{ t('settings.insertSpaces') }}</span>
              </label>
              <div v-if="options.transforms.spaces.enabled" :class="$style.fields">
                <label :class="$style.check">
                  <input :id="id + '-space-annotations'" v-model="options.transforms.spaces.annotations" type="checkbox" />
                  <span>{{ t('settings.spaceAnnotations') }}</span>
                </label>
                <fieldset :class="$style.ruleSet">
                  <legend>{{ t('settings.spaceRules') }}</legend>
                  <label v-for="rule in spaceRuleOptions" :key="rule.value" :class="$style.check">
                    <input v-model="options.transforms.spaces.rules" type="checkbox" :value="rule.value" />
                    <span>{{ rule.label }}</span>
                  </label>
                </fieldset>
                <small :class="[$style.hint, $style.operationHint]">{{ t('settings.insertSpacesHint') }}</small>
              </div>
            </div>
          </section>
          <section v-if="format" :class="$style.section" :aria-labelledby="id + '-generate-title'">
            <div :class="$style.header">
              <h3 :id="id + '-generate-title'" :class="$style.heading">{{ t('settings.generateOptions') }}</h3>
              <button
                :id="id + '-generate-reset'"
                type="button"
                :class="$style.reset"
                :disabled="generateChanges === 0"
                :aria-label="t('settings.generateOptions') + ' · ' + t('settings.reset')"
                @click="resetGeneration"
              >
                {{ t('settings.reset') }}
              </button>
            </div>
            <div :class="$style.grid">
              <template v-if="format === 'lrc'">
                <div :class="$style.field">
                  <label :for="id + '-word-timing'">{{ t('settings.wordTiming') }}</label>
                  <select
                    :id="id + '-word-timing'"
                    v-model="options.generate.lrc.wordTiming"
                    :aria-describedby="options.generate.lrc.wordTiming === 'bracket' ? id + '-word-timing-hint' : undefined"
                  >
                    <option value="angle">{{ t('settings.wordTimingAngle') }}</option>
                    <option value="bracket">{{ t('settings.wordTimingBracket') }}</option>
                    <option value="none">{{ t('settings.wordTimingNone') }}</option>
                  </select>
                  <small v-if="options.generate.lrc.wordTiming === 'bracket'" :id="id + '-word-timing-hint'">{{
                    t('settings.wordTimingBracketHint')
                  }}</small>
                </div>
                <div :class="$style.field">
                  <label :for="id + '-time-format'">{{ t('settings.timeFormat') }}</label>
                  <input
                    :id="id + '-time-format'"
                    v-model="options.generate.lrc.timeFormat"
                    type="text"
                    :list="id + '-time-formats'"
                    placeholder="mm:ss.SSS"
                    spellcheck="false"
                    autocapitalize="off"
                    :aria-describedby="id + '-time-format-hint'"
                  />
                  <datalist :id="id + '-time-formats'">
                    <option v-for="pattern in timeFormats" :key="pattern" :value="pattern" />
                  </datalist>
                  <small :id="id + '-time-format-hint'">{{ t('settings.timeFormatHint') }}</small>
                </div>
                <div :class="$style.checks">
                  <label :class="$style.check">
                    <input :id="id + '-include-meta'" v-model="options.generate.lrc.includeMeta" type="checkbox" />
                    <span>{{ t('settings.includeMeta') }}</span>
                  </label>
                  <label :class="$style.check">
                    <input :id="id + '-include-instrumental'" v-model="options.generate.lrc.includeInstrumental" type="checkbox" />
                    <span>{{ t('settings.includeInstrumental') }}</span>
                  </label>
                  <label :class="[$style.check, { [$style.disabled]: options.generate.lrc.wordTiming === 'none' }]">
                    <input
                      :id="id + '-include-word-end'"
                      v-model="options.generate.lrc.includeWordEnd"
                      type="checkbox"
                      :disabled="options.generate.lrc.wordTiming === 'none'"
                    />
                    <span>{{ t('settings.includeWordEnd') }}</span>
                  </label>
                </div>
              </template>
              <template v-else>
                <div :class="$style.field">
                  <label :for="id + '-profile'">{{ t('settings.profile') }}</label>
                  <select :id="id + '-profile'" v-model="options.generate.ttml.profile" :aria-describedby="id + '-profile-hint'">
                    <option value="auto">{{ t('settings.profileAuto') }}</option>
                    <option value="amll">AMLL</option>
                    <option value="itunes">iTunes</option>
                  </select>
                  <small :id="id + '-profile-hint'">{{ t('settings.profileHint') }}</small>
                </div>
                <div :class="[$style.checks, $style.inlineChecks]">
                  <label :class="$style.check">
                    <input :id="id + '-include-meta'" v-model="options.generate.ttml.includeMeta" type="checkbox" />
                    <span>{{ t('settings.includeMeta') }}</span>
                  </label>
                  <label :class="$style.check">
                    <input :id="id + '-indent'" v-model="options.generate.ttml.indent" type="checkbox" />
                    <span>{{ t('settings.indent') }}</span>
                  </label>
                </div>
              </template>
            </div>
          </section>
        </template>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { LyricFormat } from '@gondola-lyrics/kit'
import type { MessageKey } from '../composables/useI18n'
import type { PlaygroundOptions } from '../lib/options'

import { computed, ref, watch } from 'vue'

import { InsertSpacesRules } from '@gondola-lyrics/kit'

import { useI18n } from '../composables/useI18n'
import { createOptions, getOptionOverrides } from '../lib/options'

import NumberField from './number-field.vue'

const props = defineProps<{ id: string; scope: 'parse' | 'result'; format: LyricFormat | null }>()
const options = defineModel<PlaygroundOptions>({ required: true })
const { t } = useI18n()
const opened = ref(false)
const defaults = createOptions()
const timeFormats = ['mm:ss.SSS', 'mm:ss.SS', 'mm:ss', 'hh:mm:ss.SSS', 'ss.SSS']
const creditNameSeparators = ref(options.value.transforms.credits.nameSeparators.join('\n'))

const readCreditSeparators = (value: string): string[] => {
  return [...new Set(value.split(/\r\n?|\n/).filter((separator) => separator !== ''))]
}

const updateCreditSeparators = (event: Event) => {
  const target = event.target
  if (!(target instanceof HTMLTextAreaElement)) {
    return
  }
  creditNameSeparators.value = target.value
  options.value.transforms.credits.nameSeparators = readCreditSeparators(target.value)
}

watch(
  () => options.value.transforms.credits.nameSeparators,
  (separators) => {
    const draft = readCreditSeparators(creditNameSeparators.value)
    const hasSeparatorChanges = draft.length !== separators.length || draft.some((separator, index) => separator !== separators[index])
    // Keep editing newlines while the draft still represents the stored separators.
    if (hasSeparatorChanges) {
      creditNameSeparators.value = separators.join('\n')
    }
  },
  { deep: true },
)

const spaceRuleOptions = computed(() => {
  const labels: Record<string, MessageKey> = {
    [InsertSpacesRules.CJK_ENGLISH]: 'settings.spaceRuleCjkEnglish',
    [InsertSpacesRules.CJK_NUMBER]: 'settings.spaceRuleCjkNumber',
    [InsertSpacesRules.PUNCTUATION]: 'settings.spaceRulePunctuation',
    [InsertSpacesRules.QUOTE]: 'settings.spaceRuleQuote',
    [InsertSpacesRules.BRACKET_OUTSIDE]: 'settings.spaceRuleBracketOutside',
    [InsertSpacesRules.MATH_OPERATOR]: 'settings.spaceRuleMathOperator',
    [InsertSpacesRules.HYPHEN]: 'settings.spaceRuleHyphen',
    [InsertSpacesRules.SLASH]: 'settings.spaceRuleSlash',
    [InsertSpacesRules.COMPRESS_SPACES]: 'settings.spaceRuleCompressSpaces',
    [InsertSpacesRules.TRIM_INSIDE_SYMBOLS]: 'settings.spaceRuleTrimInsideSymbols',
  }
  return Object.entries(labels).map(([value, key]) => ({ value, label: t(key) }))
})

const available = computed(() => {
  return props.scope === 'result' || props.format !== null
})
const overrides = computed(() => getOptionOverrides(options.value))
const parseChanges = computed(() => {
  return props.format ? Object.keys(overrides.value?.parse?.[props.format] ?? {}).length : 0
})
const transformChanges = computed(() => {
  return Object.values(overrides.value?.transforms ?? {}).reduce((count, group) => count + Object.keys(group).length, 0)
})
const generateChanges = computed(() => {
  return props.format ? Object.keys(overrides.value?.generate?.[props.format] ?? {}).length : 0
})
const changed = computed(() => {
  return props.scope === 'parse' ? parseChanges.value : transformChanges.value + generateChanges.value
})
const resetParse = () => {
  const initial = createOptions()
  if (props.format === 'lrc') {
    options.value.parse.lrc = initial.parse.lrc
  } else if (props.format === 'ttml') {
    options.value.parse.ttml = initial.parse.ttml
  }
}
const resetTransforms = () => {
  options.value.transforms = createOptions().transforms
}
const resetGeneration = () => {
  const initial = createOptions()
  if (props.format === 'lrc') {
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

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 12px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--line);
  background: #fff;
}

.source .toolbar {
  background: #f8fbfe;
}

.tabs {
  min-width: 0;
}

.toggle,
.panelReset {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--muted);
  font-size: 11px;
  white-space: nowrap;

  &:hover {
    color: var(--primary-deep);
  }
}

.toggle {
  margin-left: auto;

  svg {
    flex-shrink: 0;
    transition: transform 120ms ease;
  }
}

.active {
  color: var(--primary-deep);
}

.open {
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
  min-width: 0;
  padding: 14px 16px 16px;
  border-bottom: 1px solid var(--line);
  background: #fcfdff;
}

.panelReset {
  position: absolute;
  top: 5px;
  right: 16px;
  z-index: 1;
}

.content {
  container: options / inline-size;

  > :global(section) + :global(section) {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--line);
  }
}

@media (max-width: 520px) {
  .toolbar {
    gap: 0 8px;
    padding: 5px 8px;
  }

  .panel {
    padding-inline: 12px;
  }

  .toggle,
  .panelReset {
    min-height: 44px;
  }

  .panelReset {
    top: 2px;
    right: 12px;
  }
}

.section {
  min-width: 0;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 4px;
}

.heading {
  min-width: 0;
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  font-weight: 550;
  line-height: 1.6;
}

.reset {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  min-height: 36px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--muted);
  font-size: 11px;
  white-space: nowrap;

  &:hover {
    color: var(--primary-deep);
  }
}

@media (max-width: 520px) {
  .reset {
    min-height: 44px;
  }
}

.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px 20px;
}

.checks {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: repeat(auto-fit, minmax(min(185px, 100%), 1fr));
  gap: 2px 20px;
}

.inlineChecks {
  grid-column: auto;
  grid-template-columns: minmax(0, 1fr);
  align-self: end;
}

.operation {
  display: grid;
  align-items: start;
  gap: 6px;

  + .operation {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
}

.fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 12px 14px;
  padding-top: 3px;
}

.emphasis {
  max-width: 440px;
}

.creditSeparators {
  grid-column: 1 / -1;
  max-width: 440px;
}

.hint {
  grid-column: 1 / -1;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

/* A hint sitting directly under an operation label stays in the first column, close to the checkbox. */
.operationHint {
  grid-column: auto;
  padding-top: 0;
}

.ruleSet {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: repeat(auto-fit, minmax(min(170px, 100%), 1fr));
  gap: 0 16px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;

  legend {
    margin-bottom: 2px;
    padding: 0;
    color: var(--muted);
    font-size: 11px;
  }
}

@container options (min-width: 330px) {
  .fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));

    > :last-child {
      grid-column: 1 / -1;
    }
  }
}

@container options (min-width: 560px) {
  .operation {
    grid-template-columns: 140px minmax(0, 1fr);
    gap: 16px;
  }

  .fields {
    grid-template-columns: repeat(3, minmax(0, 1fr));

    > :last-child {
      grid-column: auto;
    }

    > .hint {
      grid-column: 1 / -1;
    }

    > div > label {
      min-height: 36px;
    }
  }
}

@container options (min-width: 480px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.parse {
  max-width: 640px;

  :global(label) {
    min-height: 24px;
    padding-right: 96px;
  }
}

.field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-self: start;
  gap: 7px;
  color: var(--text);
  font-size: 12px;

  > label {
    line-height: 1.5;
  }

  :global(input),
  :global(select),
  :global(textarea) {
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

  :global(input),
  :global(textarea) {
    font-family: var(--mono);
  }

  :global(textarea) {
    resize: vertical;
    line-height: 1.6;
  }

  :global(input[aria-invalid='true']) {
    border-color: #bd6675;
  }

  small {
    color: var(--muted);
    font-size: 11px;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }

  .error {
    color: #963e50;
  }
}

@media (max-width: 820px) {
  .field :global(input),
  .field :global(select) {
    min-height: 44px;
    font-size: 16px;
  }
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  min-height: 40px;
  min-width: 0;
  color: var(--text);
  font-size: 12px;
  line-height: 1.6;
  cursor: pointer;

  input {
    width: 15px;
    height: 15px;
    margin: 0;
    flex-shrink: 0;
  }
}

.disabled {
  color: var(--muted);
  cursor: default;
}

@media (max-width: 820px) {
  .check {
    min-height: 44px;
  }
}
</style>
