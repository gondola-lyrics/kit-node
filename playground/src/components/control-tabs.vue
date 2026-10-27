<template>
  <div :class="$style.tabs" role="tablist" :aria-label="label">
    <button
      v-for="(item, index) in items"
      :id="item.id"
      :key="item.value"
      ref="buttons"
      type="button"
      role="tab"
      :aria-selected="model === item.value"
      :aria-controls="item.controls"
      :tabindex="model === item.value ? 0 : -1"
      @click="model = item.value"
      @keydown="navigate($event, index)"
    >
      {{ item.label }}
    </button>
  </div>
</template>

<script setup lang="ts" generic="Value extends string">
import { nextTick, ref } from 'vue'

const props = defineProps<{
  label: string
  items: { value: Value; label: string; id: string; controls: string }[]
}>()
const model = defineModel<Value>({ required: true })
const buttons = ref<HTMLButtonElement[]>([])

const navigate = async (event: KeyboardEvent, index: number) => {
  let target = index
  if (event.key === 'ArrowRight') {
    target = (index + 1) % props.items.length
  } else if (event.key === 'ArrowLeft') {
    target = (index + props.items.length - 1) % props.items.length
  } else if (event.key === 'Home') {
    target = 0
  } else if (event.key === 'End') {
    target = props.items.length - 1
  } else {
    return
  }
  const item = props.items[target]
  if (!item) {
    return
  }
  event.preventDefault()
  model.value = item.value
  await nextTick()
  buttons.value[target]?.focus()
}
</script>

<style module lang="scss">
.tabs {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;

  button {
    min-height: 40px;
    padding: 7px 10px;
    border: 0;
    background: transparent;
    color: var(--muted);
    font-size: 12px;
    white-space: nowrap;
    transition: color 120ms ease;

    &:hover {
      color: var(--primary-deep);
    }

    &[aria-selected='true'] {
      color: var(--primary-deep);
    }
  }
}

@media (max-width: 520px) {
  .tabs {
    gap: 1px;

    button {
      min-height: 44px;
      padding-inline: 5px;
    }
  }
}

@media (max-width: 360px) {
  .tabs {
    gap: 0;

    button {
      padding-inline: 4px;
      font-size: 11px;
    }
  }
}
</style>
