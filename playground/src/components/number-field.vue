<template>
  <div :class="$style.field">
    <label :for="id">{{ label }}</label>
    <span :class="$style.control">
      <input
        :id="id"
        :value="draft"
        type="number"
        :min="min"
        :max="max"
        :step="integer ? 1 : 'any'"
        :inputmode="integer ? 'numeric' : 'decimal'"
        :placeholder="placeholder ?? (defaultValue === undefined ? '' : String(defaultValue))"
        :aria-invalid="invalid || undefined"
        :aria-describedby="invalid ? id + '-error' : hint ? id + '-hint' : undefined"
        @focus="focused = true"
        @input="updateDraft"
        @blur="finishEditing"
      />
      <span :class="$style.unit">ms</span>
    </span>
    <small v-if="invalid" :id="id + '-error'" :class="$style.error" role="status">{{ t('settings.invalidNumber') }}</small>
    <small v-else-if="hint" :id="id + '-hint'">{{ hint }}</small>
  </div>
</template>

<script setup lang="ts">
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
const draft = ref(props.modelValue === undefined ? '' : String(props.modelValue))
const focused = ref(false)
const invalid = ref(false)

// Keep invalid drafts local so the displayed value cannot silently apply a different setting.
const updateDraft = (event: Event) => {
  const input = event.target as HTMLInputElement
  draft.value = input.value
  const value = Number(input.value)
  invalid.value =
    input.validity.badInput ||
    (input.value !== '' && (!Number.isFinite(value) || value < props.min || value > props.max || (props.integer && !Number.isSafeInteger(value))))
  if (invalid.value) {
    return
  }
  if (input.value === '') {
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
  draft.value = props.modelValue === undefined ? '' : String(props.modelValue)
}

watch(
  () => props.modelValue,
  (value) => {
    if (!focused.value) {
      invalid.value = false
      draft.value = value === undefined ? '' : String(value)
    }
  },
)
</script>

<style module lang="scss">
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

  :global(input) {
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

  :global(input) {
    font-family: var(--mono);
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
  .field :global(input) {
    min-height: 44px;
    font-size: 16px;
  }
}

.control {
  position: relative;
  display: block;

  input {
    padding-right: 48px;
  }
}

.unit {
  position: absolute;
  top: 50%;
  right: 27px;
  color: var(--muted);
  font: 10px var(--mono);
  transform: translateY(-50%);
  pointer-events: none;
}
</style>
