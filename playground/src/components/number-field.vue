<template>
  <NFormItem
    :class="$style.field"
    :label="label"
    :label-props="{ for: id }"
    :validation-status="invalid ? 'error' : undefined"
    :show-feedback="invalid || !!hint"
  >
    <NInputNumber
      :class="$style.control"
      :value="modelValue ?? null"
      :min="min"
      :max="max"
      :validator="validateValue"
      clearable
      :placeholder="placeholder ?? (defaultValue === undefined ? '' : String(defaultValue))"
      :input-props="{
        id,
        inputmode: integer ? 'numeric' : 'decimal',
        'aria-invalid': invalid || undefined,
        'aria-describedby': invalid ? id + '-error' : hint ? id + '-hint' : undefined,
        onInput: updateDraft,
      }"
      @focus="focused = true"
      @update:value="updateValue"
      @clear="invalid = false"
      @blur="finishEditing"
    >
      <template #suffix><NText depth="3" :class="$style.unit">ms</NText></template>
    </NInputNumber>
    <template #feedback>
      <span v-if="invalid" :id="id + '-error'" role="status">{{ t('settings.invalidNumber') }}</span>
      <span v-else-if="hint" :id="id + '-hint'">{{ hint }}</span>
    </template>
  </NFormItem>
</template>

<script setup lang="ts">
import { NFormItem, NInputNumber, NText } from 'naive-ui'
import { ref, watch } from 'vue'

import { useI18n } from '../composables/useI18n'

const props = withDefaults(
  defineProps<{
    id: string
    label: string
    modelValue?: number
    defaultValue?: number
    min?: number
    max?: number
    integer?: boolean
    placeholder?: string
    hint?: string
  }>(),
  { min: 0, max: Number.MAX_SAFE_INTEGER, integer: true },
)
const emit = defineEmits<{
  'update:modelValue': [value: number]
  clear: []
}>()
const { t } = useI18n()
const focused = ref(false)
const invalid = ref(false)

// Keep invalid drafts local so the displayed value cannot silently apply a different setting.
const updateDraft = (event: Event) => {
  const input = event.target as HTMLInputElement
  const value = Number(input.value)
  invalid.value =
    input.validity.badInput ||
    (input.value !== '' && (!Number.isFinite(value) || value < props.min || value > props.max || (props.integer && !Number.isSafeInteger(value))))
}

const validateValue = (value: number): boolean => {
  return !invalid.value && Number.isFinite(value) && value >= props.min && value <= props.max && (!props.integer || Number.isSafeInteger(value))
}

const updateValue = (value: number | null) => {
  if (value !== null && !validateValue(value)) {
    return
  }
  if (value === null) {
    if (props.defaultValue === undefined) {
      emit('clear')
    } else {
      emit('update:modelValue', props.defaultValue)
    }
    return
  }
  emit('update:modelValue', value)
}

const finishEditing = () => {
  focused.value = false
  invalid.value = false
}

watch(
  () => props.modelValue,
  () => {
    if (!focused.value) {
      invalid.value = false
    }
  },
)
</script>

<style module lang="scss">
.field {
  min-width: 0;
  align-self: start;

  :global(input) {
    font-family: var(--mono);
  }
}

@media (max-width: 820px) {
  .field :global(input) {
    font-size: 16px;
  }
}

.unit {
  font: 10px var(--mono);
}

.control {
  width: 100%;
}
</style>
