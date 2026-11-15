<template>
  <div :class="[$style.root, { [$style.source]: scope === 'parse' }]">
    <div :class="$style.toolbar">
      <div :class="$style.tabs"><slot /></div>
      <NButton
        v-if="available"
        quaternary
        size="small"
        :class="$style.toggle"
        :type="opened ? 'primary' : 'default'"
        :aria-expanded="opened"
        :aria-controls="id + '-panel'"
        @click="opened = !opened"
      >
        {{ t('settings.title') }}
        <NTag v-if="changed" size="small" type="primary" :bordered="false" :aria-label="t('settings.modified') + ': ' + changed">{{ changed }}</NTag>
        <NText aria-hidden="true">{{ opened ? '−' : '+' }}</NText>
      </NButton>
    </div>
    <NCollapseTransition v-if="available" :show="opened">
      <section :id="id + '-panel'" :class="$style.panel" :aria-label="t('settings.title')">
        <div v-if="scope === 'parse'" :class="$style.parseHeader">
          <NButton quaternary size="small" :disabled="changed === 0" @click="resetParse">{{ t('settings.reset') }}</NButton>
        </div>
        <NForm size="small" label-placement="top" :show-feedback="false" :class="$style.content">
          <div v-if="scope === 'parse'" :class="$style.parse">
            <NumberField
              v-if="format === 'lrc' || format === 'qrc' || format === 'yrc'"
              :id="id + '-tolerance'"
              v-model="annotationOptions.annotationTolerance"
              :label="t('settings.annotationTolerance')"
              :hint="t(format === 'qrc' ? 'settings.qrcAnnotationToleranceHint' : 'settings.annotationToleranceHint')"
              :integer="false"
              :default-value="annotationDefaults.annotationTolerance"
            />
            <NFormItem v-else-if="format === 'ttml'" :label="t('settings.language')" :label-props="{ for: id + '-language' }" :class="$style.field">
              <NInput
                v-model:value="options.parse.ttml.language"
                placeholder="zh-CN, en…"
                :input-props="{ ...textInputProps, id: id + '-language', 'aria-describedby': id + '-language-hint' }"
              />
              <NText :id="id + '-language-hint'" depth="3" :class="$style.hint">{{ t('settings.languageHint') }}</NText>
            </NFormItem>
            <NumberField
              v-if="format === 'lrc' || format === 'qrc' || format === 'yrc'"
              :id="id + '-word-tolerance'"
              v-model="annotationOptions.wordAnnotationTolerance"
              :label="t('settings.wordAnnotationTolerance')"
              :hint="t(format === 'qrc' ? 'settings.qrcWordAnnotationToleranceHint' : 'settings.wordAnnotationToleranceHint')"
              :integer="false"
              :default-value="annotationDefaults.wordAnnotationTolerance"
            />
            <div v-if="format === 'lrc' || format === 'qrc' || format === 'yrc'" :class="$style.fullWidth">
              <NCheckbox
                :id="id + '-word-fallback'"
                v-model:checked="annotationOptions.wordAnnotationFallback"
                :aria-describedby="id + '-word-fallback-hint'"
              >
                {{ t('settings.wordAnnotationFallback') }}
              </NCheckbox>
              <NText :id="id + '-word-fallback-hint'" depth="3" :class="$style.hint">{{ t('settings.wordAnnotationFallbackHint') }}</NText>
            </div>
          </div>
          <template v-else>
            <section :class="$style.section" :aria-labelledby="id + '-transforms-title'">
              <div :class="$style.header">
                <NH3 :id="id + '-transforms-title'" :class="$style.heading">{{ t('settings.transforms') }}</NH3>
                <NButton
                  :id="id + '-transforms-reset'"
                  quaternary
                  size="small"
                  :disabled="transformChanges === 0"
                  :aria-label="t('settings.transforms') + ' · ' + t('settings.reset')"
                  @click="resetTransforms"
                  >{{ t('settings.reset') }}</NButton
                >
              </div>
              <div :class="$style.operation">
                <NCheckbox :id="id + '-credits'" v-model:checked="options.transforms.credits.enabled" :class="$style.check">{{
                  t('settings.extractCredits')
                }}</NCheckbox>
                <div v-if="options.transforms.credits.enabled" :class="[$style.fields, $style.credits]">
                  <NCheckbox :id="id + '-credit-source-lines'" v-model:checked="options.transforms.credits.removeSourceLines">{{
                    t('settings.removeCreditLines')
                  }}</NCheckbox>
                  <div>
                    <NCheckbox
                      :id="id + '-credit-match-unknowns'"
                      v-model:checked="options.transforms.credits.matchUnknowns"
                      :aria-describedby="id + '-credit-unknowns-hint'"
                      >{{ t('settings.matchCreditUnknowns') }}</NCheckbox
                    >
                    <NText :id="id + '-credit-unknowns-hint'" depth="3" :class="$style.hint">{{ t('settings.matchCreditUnknownsHint') }}</NText>
                  </div>
                  <NFormItem :label="t('settings.creditNameSeparators')" :label-props="{ for: id + '-credit-name-separators' }" :class="$style.field">
                    <NInput
                      :value="creditNameSeparators"
                      type="textarea"
                      :rows="3"
                      :input-props="{ ...textInputProps, id: id + '-credit-name-separators', 'aria-describedby': id + '-credit-separators-hint' }"
                      @update:value="updateCreditSeparators"
                      @blur="creditNameSeparators = options.transforms.credits.nameSeparators.join('\n')"
                    />
                    <NText :id="id + '-credit-separators-hint'" depth="3" :class="$style.hint">{{ t('settings.creditNameSeparatorsHint') }}</NText>
                  </NFormItem>
                </div>
              </div>
              <div :class="$style.operation">
                <NCheckbox :id="id + '-filters'" v-model:checked="options.transforms.filters.enabled" :class="$style.check">{{
                  t('settings.removeNonLyric')
                }}</NCheckbox>
                <div v-if="options.transforms.filters.enabled" :class="[$style.fields, $style.twoColumns]">
                  <NText depth="3" :class="[$style.hint, $style.fullWidth]">{{ t('settings.musicInfoFormatHint') }}</NText>
                  <NFormItem :label="t('settings.musicTitles')" :label-props="{ for: id + '-music-titles' }" :class="$style.field">
                    <NInput
                      :value="musicTitlesText"
                      type="textarea"
                      :rows="3"
                      :input-props="{ ...textInputProps, id: id + '-music-titles', 'aria-describedby': id + '-music-info-hint' }"
                      @update:value="updateMusicInfo('titles', $event)"
                    />
                  </NFormItem>
                  <NFormItem :label="t('settings.musicArtists')" :label-props="{ for: id + '-music-artists' }" :class="$style.field">
                    <NInput
                      :value="musicArtistsText"
                      type="textarea"
                      :rows="3"
                      :input-props="{ ...textInputProps, id: id + '-music-artists', 'aria-describedby': id + '-music-info-hint' }"
                      @update:value="updateMusicInfo('artists', $event)"
                    />
                  </NFormItem>
                  <NText :id="id + '-music-info-hint'" depth="3" :class="[$style.hint, $style.fullWidth]">{{ t('settings.musicInfoHint') }}</NText>
                  <NFormItem :label="t('settings.nonLyricCategories')" :class="[$style.field, $style.fullWidth]">
                    <NCheckboxGroup v-model:value="options.transforms.filters.categories" :class="$style.ruleGrid">
                      <NCheckbox v-for="category in nonLyricCategoryOptions" :key="category.value" :value="category.value">{{
                        category.label
                      }}</NCheckbox>
                    </NCheckboxGroup>
                    <NText depth="3" :class="$style.hint">{{ t('settings.removeNonLyricHint') }}</NText>
                  </NFormItem>
                </div>
              </div>
              <div :class="$style.operation">
                <NCheckbox :id="id + '-agents'" v-model:checked="options.transforms.agents.enabled" :class="$style.check">{{
                  t('settings.extractAgents')
                }}</NCheckbox>
                <div v-if="options.transforms.agents.enabled" :class="[$style.fields, $style.twoColumns]">
                  <NFormItem :label="t('settings.agentMatchMode')" :label-props="{ for: id + '-agent-mode' }" :class="$style.field">
                    <NSelect
                      :id="id + '-agent-mode'"
                      v-model:value="agentMatchMode"
                      :options="agentMatchOptions"
                      :aria-label="t('settings.agentMatchMode')"
                      :aria-describedby="id + '-agent-mode-hint'"
                    />
                    <NText :id="id + '-agent-mode-hint'" depth="3" :class="$style.hint">{{
                      t(agentMatchMode === 'legacy' ? 'settings.agentLegacyHint' : 'settings.agentBindingsModeHint')
                    }}</NText>
                  </NFormItem>
                  <NCheckbox :id="id + '-agent-prefixes'" v-model:checked="options.transforms.agents.removePrefixes" :class="$style.alignedCheck">{{
                    t('settings.removeAgentPrefixes')
                  }}</NCheckbox>
                  <NFormItem
                    v-if="agentMatchMode === 'bindings'"
                    :label="t('settings.agentBindings')"
                    :label-props="{ for: id + '-agent-bindings' }"
                    :class="[$style.field, $style.fullWidth]"
                  >
                    <NInput
                      :value="agentBindingsText"
                      type="textarea"
                      :rows="5"
                      :status="agentBindingsError ? 'error' : undefined"
                      :input-props="{
                        ...textInputProps,
                        id: id + '-agent-bindings',
                        'aria-invalid': !!agentBindingsError,
                        'aria-describedby': id + '-agent-bindings-hint' + (agentBindingsError ? ' ' + id + '-agent-bindings-error' : ''),
                      }"
                      @update:value="updateAgentBindings"
                    />
                    <NText :id="id + '-agent-bindings-hint'" depth="3" :class="$style.hint">{{ t('settings.agentBindingsHint') }}</NText>
                    <NAlert
                      v-if="agentBindingsError"
                      :id="id + '-agent-bindings-error'"
                      type="error"
                      :show-icon="false"
                      :class="$style.feedback"
                      role="alert"
                      >{{ t(agentBindingsError) }}</NAlert
                    >
                  </NFormItem>
                </div>
              </div>
              <div :class="$style.operation">
                <NCheckbox :id="id + '-instrumental'" v-model:checked="options.transforms.instrumental.enabled" :class="$style.check">{{
                  t('settings.insertInstrumental')
                }}</NCheckbox>
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
                <NCheckbox :id="id + '-emphasis'" v-model:checked="options.transforms.emphasis.enabled" :class="$style.check">{{
                  t('settings.emphasis')
                }}</NCheckbox>
                <NumberField
                  v-if="options.transforms.emphasis.enabled"
                  :id="id + '-duration-threshold'"
                  v-model="options.transforms.emphasis.durationThreshold"
                  :class="$style.emphasis"
                  :label="t('settings.durationThreshold')"
                  :default-value="defaults.transforms.emphasis.durationThreshold"
                />
              </div>
              <div :class="$style.operation">
                <NCheckbox :id="id + '-extract'" v-model:checked="options.transforms.extract.enabled" :class="$style.check">{{
                  t('settings.extractBackground')
                }}</NCheckbox>
                <div v-if="options.transforms.extract.enabled" :class="$style.checks">
                  <NCheckbox :id="id + '-extract-full-line'" v-model:checked="options.transforms.extract.fullLine">{{
                    t('settings.extractFullLine')
                  }}</NCheckbox>
                  <NCheckbox :id="id + '-extract-in-line'" v-model:checked="options.transforms.extract.inLine">{{
                    t('settings.extractInLine')
                  }}</NCheckbox>
                  <NCheckbox :id="id + '-extract-cross-line'" v-model:checked="options.transforms.extract.crossLine">{{
                    t('settings.extractCrossLine')
                  }}</NCheckbox>
                  <NText depth="3" :class="[$style.hint, $style.fullWidth]">{{ t('settings.extractHint') }}</NText>
                </div>
              </div>
              <div :class="$style.operation">
                <NCheckbox :id="id + '-strip-brackets'" v-model:checked="options.transforms.brackets.enabled" :class="$style.check">{{
                  t('settings.stripBrackets')
                }}</NCheckbox>
              </div>
              <div :class="$style.operation">
                <NCheckbox :id="id + '-insert-spaces'" v-model:checked="options.transforms.spaces.enabled" :class="$style.check">{{
                  t('settings.insertSpaces')
                }}</NCheckbox>
                <div v-if="options.transforms.spaces.enabled" :class="$style.fields">
                  <NCheckbox :id="id + '-space-annotations'" v-model:checked="options.transforms.spaces.annotations" :class="$style.fullWidth">{{
                    t('settings.spaceAnnotations')
                  }}</NCheckbox>
                  <NFormItem :label="t('settings.spaceRules')" :class="[$style.field, $style.fullWidth]">
                    <NCheckboxGroup v-model:value="options.transforms.spaces.rules" :class="$style.ruleGrid">
                      <NCheckbox v-for="rule in spaceRuleOptions" :key="rule.value" :value="rule.value">{{ rule.label }}</NCheckbox>
                    </NCheckboxGroup>
                  </NFormItem>
                </div>
              </div>
            </section>
            <section v-if="format === 'lrc' || format === 'ttml'" :class="$style.section" :aria-labelledby="id + '-generate-title'">
              <div :class="$style.header">
                <NH3 :id="id + '-generate-title'" :class="$style.heading">{{ t('settings.generateOptions') }}</NH3>
                <NButton
                  :id="id + '-generate-reset'"
                  quaternary
                  size="small"
                  :disabled="generateChanges === 0"
                  :aria-label="t('settings.generateOptions') + ' · ' + t('settings.reset')"
                  @click="resetGeneration"
                  >{{ t('settings.reset') }}</NButton
                >
              </div>
              <div :class="$style.grid">
                <template v-if="format === 'lrc'">
                  <NFormItem :label="t('settings.wordTiming')" :label-props="{ for: id + '-word-timing' }" :class="$style.field">
                    <NSelect
                      :id="id + '-word-timing'"
                      v-model:value="options.generate.lrc.wordTiming"
                      :options="wordTimingOptions"
                      :aria-label="t('settings.wordTiming')"
                      :aria-describedby="options.generate.lrc.wordTiming === 'bracket' ? id + '-word-timing-hint' : undefined"
                    />
                    <NText v-if="options.generate.lrc.wordTiming === 'bracket'" :id="id + '-word-timing-hint'" depth="3" :class="$style.hint">{{
                      t('settings.wordTimingBracketHint')
                    }}</NText>
                  </NFormItem>
                  <NFormItem :label="t('settings.timeFormat')" :label-props="{ for: id + '-time-format' }" :class="$style.field">
                    <NAutoComplete
                      v-model:value="options.generate.lrc.timeFormat"
                      :options="timeFormats"
                      placeholder="mm:ss.SSS"
                      :input-props="{ ...textInputProps, id: id + '-time-format', 'aria-describedby': id + '-time-format-hint' }"
                    />
                    <NText :id="id + '-time-format-hint'" depth="3" :class="$style.hint">{{ t('settings.timeFormatHint') }}</NText>
                  </NFormItem>
                  <div :class="[$style.checks, $style.fullWidth]">
                    <NCheckbox :id="id + '-include-meta'" v-model:checked="options.generate.lrc.includeMeta">{{
                      t('settings.includeMeta')
                    }}</NCheckbox>
                    <NCheckbox :id="id + '-include-instrumental'" v-model:checked="options.generate.lrc.includeInstrumental">{{
                      t('settings.includeInstrumental')
                    }}</NCheckbox>
                    <NCheckbox
                      :id="id + '-include-word-end'"
                      v-model:checked="options.generate.lrc.includeWordEnd"
                      :disabled="options.generate.lrc.wordTiming === 'none'"
                      >{{ t('settings.includeWordEnd') }}</NCheckbox
                    >
                  </div>
                </template>
                <template v-else>
                  <NFormItem :label="t('settings.profile')" :label-props="{ for: id + '-profile' }" :class="$style.field">
                    <NSelect
                      :id="id + '-profile'"
                      v-model:value="options.generate.ttml.profile"
                      :options="profileOptions"
                      :aria-label="t('settings.profile')"
                    />
                  </NFormItem>
                  <div :class="[$style.checks, $style.inlineChecks]">
                    <NCheckbox :id="id + '-include-meta'" v-model:checked="options.generate.ttml.includeMeta">{{
                      t('settings.includeMeta')
                    }}</NCheckbox>
                    <NCheckbox :id="id + '-indent'" v-model:checked="options.generate.ttml.indent">{{ t('settings.indent') }}</NCheckbox>
                  </div>
                </template>
              </div>
            </section>
          </template>
        </NForm>
      </section>
    </NCollapseTransition>
  </div>
</template>

<script setup lang="ts">
import type { LyricFormat } from '@gondola-lyrics/kit'
import type { MessageKey } from '../composables/useI18n'
import type { PlaygroundOptions } from '../lib/options'

import {
  NAlert,
  NAutoComplete,
  NButton,
  NCheckbox,
  NCheckboxGroup,
  NCollapseTransition,
  NForm,
  NFormItem,
  NH3,
  NInput,
  NSelect,
  NTag,
  NText,
} from 'naive-ui'
import { computed, ref, watch } from 'vue'

import { InsertSpacesRules, NON_LYRIC_CATEGORIES } from '@gondola-lyrics/kit'

import { useI18n } from '../composables/useI18n'
import { createOptions, getOptionOverrides, readAgentBindings } from '../lib/options'

import NumberField from './number-field.vue'

const props = defineProps<{ id: string; scope: 'parse' | 'result'; format: LyricFormat | null }>()
const options = defineModel<PlaygroundOptions>({ required: true })
const { t } = useI18n()
const opened = ref(false)
const defaults = createOptions()
const annotationFormat = computed(() => {
  return props.format === 'qrc' || props.format === 'yrc' ? props.format : 'lrc'
})
const annotationOptions = computed(() => {
  return options.value.parse[annotationFormat.value]
})
const annotationDefaults = computed(() => {
  return defaults.parse[annotationFormat.value]
})
const timeFormats = ['mm:ss.SSS', 'mm:ss.SS', 'mm:ss', 'hh:mm:ss.SSS', 'ss.SSS']
const textInputProps = { spellcheck: false, autocomplete: 'off', autocapitalize: 'off', style: { fontFamily: 'var(--mono)' } }
const agentMatchOptions = computed(() => {
  return [
    { value: 'legacy', label: t('settings.agentLegacyMode') },
    { value: 'bindings', label: t('settings.agentBindingsMode') },
  ]
})
const wordTimingOptions = computed(() => {
  return [
    { value: 'angle', label: t('settings.wordTimingAngle') },
    { value: 'bracket', label: t('settings.wordTimingBracket') },
    { value: 'none', label: t('settings.wordTimingNone') },
  ]
})
const profileOptions = computed(() => {
  return [
    { value: 'auto', label: t('settings.profileAuto') },
    { value: 'amll', label: 'AMLL' },
    { value: 'itunes', label: 'iTunes' },
  ]
})
const creditNameSeparators = ref(options.value.transforms.credits.nameSeparators.join('\n'))
const musicTitlesText = ref(options.value.transforms.filters.musicInfo?.titles?.join('\n') ?? '')
const musicArtistsText = ref(options.value.transforms.filters.musicInfo?.artists?.join('\n') ?? '')

const readMusicNames = (value: string): string[] => {
  return value
    .split(/\r\n?|\n/)
    .map((name) => name.trim())
    .filter(Boolean)
}

const updateMusicInfo = (key: 'titles' | 'artists', value: string) => {
  const draft = key === 'titles' ? musicTitlesText : musicArtistsText
  draft.value = value
  const names = readMusicNames(value)
  const musicInfo = { ...options.value.transforms.filters.musicInfo, [key]: names.length ? names : undefined }
  options.value.transforms.filters.musicInfo = !musicInfo.titles && !musicInfo.artists ? undefined : musicInfo
}

watch(
  () => options.value.transforms.filters.musicInfo,
  (musicInfo) => {
    const fields = [
      ['titles', musicTitlesText],
      ['artists', musicArtistsText],
    ] as const
    for (const [key, draft] of fields) {
      const names = musicInfo?.[key] ?? []
      const parsed = readMusicNames(draft.value)
      if (parsed.length !== names.length || parsed.some((name, index) => name !== names[index])) {
        draft.value = names.join('\n')
      }
    }
  },
  { deep: true },
)

const formatAgentBindings = (bindings: PlaygroundOptions['transforms']['agents']['bindings']): string => {
  return JSON.stringify(bindings ?? {}, null, 2)
}
let appliedAgentBindings = options.value.transforms.agents.bindings
let appliedAgentOptions = options.value.transforms.agents
let savedAgentBindings = readAgentBindings(appliedAgentBindings)
const agentBindingsText = ref(formatAgentBindings(appliedAgentBindings))
const agentBindingsError = ref<MessageKey | ''>('')
const agentMatchMode = computed({
  get: () => {
    return options.value.transforms.agents.bindings ? 'bindings' : 'legacy'
  },
  set: (mode: 'legacy' | 'bindings') => {
    if (mode === 'legacy' && options.value.transforms.agents.bindings) {
      savedAgentBindings = readAgentBindings(options.value.transforms.agents.bindings)
    }
    options.value.transforms.agents.bindings = mode === 'bindings' ? (readAgentBindings(savedAgentBindings) ?? {}) : undefined
    appliedAgentBindings = options.value.transforms.agents.bindings
    agentBindingsText.value = formatAgentBindings(appliedAgentBindings)
    agentBindingsError.value = ''
  },
})
const updateAgentBindings = (value: string) => {
  agentBindingsText.value = value
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    agentBindingsError.value = 'settings.agentBindingsInvalidJson'
    return
  }
  const bindings = readAgentBindings(parsed)
  if (!bindings) {
    agentBindingsError.value = 'settings.agentBindingsInvalidShape'
    return
  }
  agentBindingsError.value = ''
  options.value.transforms.agents.bindings = bindings
  appliedAgentBindings = options.value.transforms.agents.bindings
  savedAgentBindings = readAgentBindings(bindings)
}

watch(
  () => [options.value.transforms.agents, options.value.transforms.agents.bindings] as const,
  ([agents, bindings]) => {
    // An accepted edit keeps its spelling and caret until another control replaces the bindings.
    if (agents !== appliedAgentOptions || bindings !== appliedAgentBindings) {
      agentBindingsText.value = formatAgentBindings(bindings)
      agentBindingsError.value = ''
      appliedAgentBindings = bindings
      appliedAgentOptions = agents
      savedAgentBindings = readAgentBindings(bindings)
    }
  },
)

const readCreditSeparators = (value: string): string[] => {
  return [...new Set(value.split(/\r\n?|\n/).filter(Boolean))]
}

const updateCreditSeparators = (value: string) => {
  creditNameSeparators.value = value
  options.value.transforms.credits.nameSeparators = readCreditSeparators(value)
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
  return Object.entries(labels).map(([value, key]) => {
    return { value, label: t(key) }
  })
})

const nonLyricCategoryOptions = computed(() => {
  const labels: Record<string, MessageKey> = {
    copyright: 'settings.nonLyricCopyright',
    adaptation: 'settings.nonLyricAdaptation',
    disclaimer: 'settings.nonLyricDisclaimer',
    organization: 'settings.nonLyricOrganization',
    studio: 'settings.nonLyricStudio',
  }
  // The rules may introduce a category before the playground names it, so the raw id remains selectable.
  return NON_LYRIC_CATEGORIES.map((value) => {
    const key = labels[value]
    return { value, label: key ? t(key) : value }
  })
})

// Formats without parse options have no settings panel to display.
const available = computed(() => {
  return props.scope === 'result' || (!!props.format && props.format !== 'krc' && props.format !== 'kwrc')
})
const overrides = computed(() => {
  return getOptionOverrides(options.value)
})
const parseChanges = computed(() => {
  return props.format && props.format !== 'krc' && props.format !== 'kwrc' ? Object.keys(overrides.value?.parse?.[props.format] ?? {}).length : 0
})
const transformChanges = computed(() => {
  return Object.values(overrides.value?.transforms ?? {}).reduce((count, group) => count + Object.keys(group).length, 0)
})
const generateChanges = computed(() => {
  const format = props.format
  return format === 'lrc' || format === 'ttml' ? Object.keys(overrides.value?.generate?.[format] ?? {}).length : 0
})
const changed = computed(() => {
  return props.scope === 'parse' ? parseChanges.value : transformChanges.value + generateChanges.value
})
const resetParse = () => {
  const initial = createOptions()
  if (props.format === 'lrc') {
    options.value.parse.lrc = initial.parse.lrc
  } else if (props.format === 'qrc') {
    options.value.parse.qrc = initial.parse.qrc
  } else if (props.format === 'yrc') {
    options.value.parse.yrc = initial.parse.yrc
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
  padding: 6px 12px;
  border-bottom: 1px solid var(--line);
}

.source .toolbar {
  background: #f8fbfe;
}

.tabs {
  min-width: 0;
  flex: 1 1 240px;
}

.toggle {
  margin-left: auto;

  :global(.n-button__content) {
    gap: 6px;
  }
}

.panel {
  min-width: 0;
  padding: 12px 20px 20px;
  border-bottom: 1px solid var(--line);
  background: #fcfdff;
}

.parseHeader {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}

.content {
  container: options / inline-size;

  > :global(section) + :global(section) {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--line);
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
  margin-bottom: 8px;
}

.heading {
  min-width: 0;
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
}

.grid,
.parse,
.fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 16px 20px;
  min-width: 0;
}

.grid,
.parse {
  max-width: 960px;
}

.checks {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(185px, 100%), 1fr));
  gap: 10px 20px;
  align-items: start;
  min-width: 0;
}

.inlineChecks {
  grid-template-columns: minmax(0, 1fr);
  align-self: center;
}

.operation {
  display: grid;
  align-items: start;
  gap: 12px 24px;
  padding-block: 16px;

  + .operation {
    border-top: 1px solid var(--line);
  }
}

.check {
  font-weight: 550;
}

.fullWidth {
  grid-column: 1 / -1;
}

.emphasis {
  max-width: 300px;
}

.hint {
  display: block;
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.ruleGrid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(175px, 100%), 1fr));
  gap: 10px 20px;
  width: 100%;
}

.field {
  min-width: 0;

  :global(.n-form-item-blank) {
    display: block;
  }
}

.feedback {
  margin-top: 8px;
}

@container options (min-width: 480px) {
  .fields,
  .grid,
  .parse {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .credits > :last-child {
    grid-column: 1 / -1;
  }

  .alignedCheck {
    margin-top: 30px;
  }
}

@container options (min-width: 760px) {
  .operation {
    grid-template-columns: 164px minmax(0, 1fr);
  }

  .fields {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .twoColumns {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .credits > :last-child {
    grid-column: auto;
  }
}

@media (max-width: 520px) {
  .toolbar {
    padding-inline: 8px;
  }

  .panel {
    padding-inline: 12px;
  }
}

@media (max-width: 820px) {
  .field :global(input),
  .field :global(textarea) {
    font-size: 16px;
  }
}
</style>
