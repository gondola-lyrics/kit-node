<template>
  <NTabs :value="model" type="bar" size="small" :class="$style.tabs" role="tablist" :aria-label="label" @update:value="selectTab">
    <NTab
      v-for="(item, index) in items"
      :id="item.id"
      :key="item.value"
      :name="item.value"
      role="tab"
      :aria-selected="model === item.value"
      :aria-controls="item.controls"
      :tabindex="model === item.value ? 0 : -1"
      @keydown="navigate($event, index)"
    >
      {{ item.label }}
    </NTab>
  </NTabs>
</template>

<script setup lang="ts" generic="Value extends string">
import { NTab, NTabs } from 'naive-ui'
import { nextTick } from 'vue'

const props = defineProps<{
  label: string
  items: { value: Value; label: string; id: string; controls: string }[]
}>()
const model = defineModel<Value>({ required: true })
const selectTab = (value: string | number) => {
  const item = props.items.find((item) => item.value === value)
  if (item) {
    model.value = item.value
  }
}

const navigate = async (event: KeyboardEvent, index: number) => {
  let target = index
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    const item = props.items[index]
    if (item) {
      model.value = item.value
    }
    return
  } else if (event.key === 'ArrowRight') {
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
  document.getElementById(item.id)?.focus()
}
</script>

<style module lang="scss">
.tabs {
  min-width: 0;

  :global(.n-tabs-bar) {
    display: none;
  }
}
</style>
