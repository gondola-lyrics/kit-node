<template>
  <NConfigProvider
    :class="$style.page"
    :theme-overrides="themeOverrides"
    :hljs="hljs"
    :locale="locale === 'zh-CN' ? zhCN : enUS"
    :date-locale="locale === 'zh-CN' ? dateZhCN : dateEnUS"
  >
    <NGlobalStyle />
    <div :class="$style.frame">
      <header :class="$style.topbar">
        <NText strong :class="$style.wordmark">Gondola Lyrics</NText>
        <NButton quaternary size="small" :class="$style.locale" :aria-label="t('app.language')" @click="toggleLocale">
          <span :class="{ [$style.localeActive]: locale === 'zh-CN' }">CN</span>
          <span :class="$style.localeSlash" aria-hidden="true">/</span>
          <span :class="{ [$style.localeActive]: locale === 'en' }">EN</span>
        </NButton>
      </header>
      <main :class="$style.workspace">
        <SourceEditor :form="form" :storage-available="storageAvailable" />
        <ResultPanel v-model="form.options" :result="result" :parsing="parsing" :error="error" :error-detail="errorDetail" />
      </main>
    </div>
  </NConfigProvider>
</template>

<script setup lang="ts">
import { NButton, NConfigProvider, NGlobalStyle, NText, dateEnUS, dateZhCN, enUS, zhCN } from 'naive-ui'
import { onMounted } from 'vue'

import SourceEditor from './components/source-editor.vue'
import ResultPanel from './components/result-panel.vue'
import { useI18n } from './composables/useI18n'
import { useParser } from './composables/useParser'
import { hljs } from './lib/highlight'
import { themeOverrides } from './lib/theme'

const { locale, t, setLocale } = useI18n()
const { form, result, parsing, error, errorDetail, storageAvailable } = useParser()
const toggleLocale = () => {
  setLocale(locale.value === 'zh-CN' ? 'en' : 'zh-CN')
}
onMounted(() => {
  document.documentElement.lang = locale.value
})
</script>

<style module lang="scss">
.page {
  position: relative;
  isolation: isolate;
  min-height: 100vh;

  // Keep the background stable while output views change height.
  &::before {
    content: '';
    position: fixed;
    inset: 0;
    z-index: -1;
    background: linear-gradient(180deg, #f8fbfe, #f1f7fc 500px);
    pointer-events: none;
  }
}

.frame {
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  padding: 0 clamp(20px, 3.5vw, 56px) 48px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 80px;
  margin-bottom: 12px;
}

.wordmark {
  color: var(--text);
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -0.03em;
}

.locale {
  min-height: 44px;
  color: var(--muted);
  font: 11px var(--mono);
  letter-spacing: 0.08em;

  :global(.n-button__content) {
    gap: 8px;
  }
}

.localeActive {
  color: var(--primary-deep);
  text-decoration: underline;
  text-underline-offset: 5px;
}

.localeSlash {
  color: var(--line);
}

.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 28px;
}

@media (max-width: 520px) {
  .frame {
    padding-inline: 16px;
  }

  .topbar {
    min-height: 68px;
    margin-bottom: 8px;
  }

  .wordmark {
    font-size: 16px;
  }
}
</style>
