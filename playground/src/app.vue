<template>
  <div :class="$style.page">
    <div :class="$style.frame">
      <header :class="$style.topbar">
        <div :class="$style.brand">
          <span :class="$style.wordmark">Gondola Lyrics</span>
        </div>
        <button :class="$style.locale" type="button" :aria-label="t('app.language')" @click="toggleLocale">
          <span :class="{ [$style.localeActive]: locale === 'zh-CN' }">CN</span>
          <span :class="$style.localeSlash" aria-hidden="true">/</span>
          <span :class="{ [$style.localeActive]: locale === 'en' }">EN</span>
        </button>
      </header>

      <main :class="$style.main">
        <section :class="$style.block" aria-labelledby="input-heading">
          <h2 id="input-heading" :class="$style.visuallyHidden">{{ t('input.title') }}</h2>

          <div :class="$style.body">
            <OptionsPanel id="parse-options" v-model="form.options" scope="parse" :format="form.mode === 'auto' ? null : form.mode">
              <div :class="$style.modeTabs" role="tablist" :aria-label="t('settings.mode')">
                <button
                  id="mode-auto"
                  type="button"
                  role="tab"
                  :aria-selected="form.mode === 'auto'"
                  :aria-controls="'input-auto'"
                  @click="form.mode = 'auto'"
                >
                  {{ t('settings.auto') }}
                </button>
                <button
                  id="mode-lrc"
                  type="button"
                  role="tab"
                  :aria-selected="form.mode === 'lrc'"
                  :aria-controls="'input-lrc'"
                  @click="form.mode = 'lrc'"
                >
                  {{ t('settings.lrc') }}
                </button>
                <button
                  id="mode-ttml"
                  type="button"
                  role="tab"
                  :aria-selected="form.mode === 'ttml'"
                  :aria-controls="'input-ttml'"
                  @click="form.mode = 'ttml'"
                >
                  {{ t('settings.ttml') }}
                </button>
              </div>
            </OptionsPanel>

            <div v-if="form.mode === 'auto'" id="input-auto" role="tabpanel" aria-labelledby="mode-auto" :class="$style.editorShell">
              <label :class="$style.visuallyHidden" for="lyrics-input-auto">{{ t('input.label') }}</label>
              <textarea
                id="lyrics-input-auto"
                v-model="form.autoContent"
                :class="$style.editor"
                spellcheck="false"
                autocomplete="off"
                autocapitalize="off"
              ></textarea>
            </div>

            <div v-else-if="form.mode === 'lrc'" id="input-lrc" role="tabpanel" aria-labelledby="mode-lrc" :class="$style.editorShell">
              <label :class="$style.visuallyHidden" for="lyrics-input-lrc">{{ t('input.label') }}</label>
              <textarea
                id="lyrics-input-lrc"
                v-model="form.lrcContent"
                :class="$style.editor"
                spellcheck="false"
                autocomplete="off"
                autocapitalize="off"
              ></textarea>

              <div :class="$style.trackSection">
                <div :class="$style.trackCell">
                  <label :class="$style.trackLabel" for="lyrics-input-translations">{{ t('input.translations') }}</label>
                  <textarea
                    id="lyrics-input-translations"
                    v-model="form.translations"
                    :class="[$style.editor, $style.trackEditor]"
                    spellcheck="false"
                    autocomplete="off"
                    autocapitalize="off"
                  ></textarea>
                </div>
                <div :class="$style.trackCell">
                  <label :class="$style.trackLabel" for="lyrics-input-romans">{{ t('input.romans') }}</label>
                  <textarea
                    id="lyrics-input-romans"
                    v-model="form.romans"
                    :class="[$style.editor, $style.trackEditor]"
                    spellcheck="false"
                    autocomplete="off"
                    autocapitalize="off"
                  ></textarea>
                </div>
              </div>
            </div>

            <div v-else id="input-ttml" role="tabpanel" aria-labelledby="mode-ttml" :class="$style.editorShell">
              <label :class="$style.visuallyHidden" for="lyrics-input-ttml">{{ t('input.label') }}</label>
              <textarea
                id="lyrics-input-ttml"
                v-model="form.ttmlContent"
                :class="$style.editor"
                spellcheck="false"
                autocomplete="off"
                autocapitalize="off"
              ></textarea>
            </div>

            <p v-if="!storageAvailable" :class="$style.warning">{{ t('input.storage') }}</p>
          </div>
        </section>

        <section :class="$style.block" aria-labelledby="result-heading" :aria-busy="parsing">
          <h2 id="result-heading" :class="$style.visuallyHidden">{{ t('result.title') }}</h2>

          <div :class="$style.body">
            <div v-if="error" :class="$style.error" role="alert">
              <strong>{{ t(error) }}</strong>
              <p v-if="errorDetail">{{ errorDetail }}</p>
            </div>

            <template v-if="result">
              <div :class="$style.resultCard">
                <div :class="$style.summary">
                  <span :class="[$style.status, { [$style.statusWarn]: result.lyric.status !== LyricStatus.VALID }]">{{ statusLabel }}</span>
                  <span :class="[$style.summaryItem, $style.summaryTiming]">{{ timingSummary }}</span>
                  <span :class="[$style.summaryItem, $style.mono]" :title="t('result.elapsed')">{{ result.elapsed.toFixed(2) }} ms</span>
                  <span :class="[$style.summaryItem, $style.mono]" :title="t('result.size')">
                    {{ formatBytes(result.inputBytes) }} → {{ result.encodedBytes === null ? '—' : formatBytes(result.encodedBytes) }}
                  </span>
                  <span :class="[$style.summaryItem, $style.mono, $style.version]">v{{ result.lyric.version }}</span>
                </div>

                <details v-if="result.diagnostics.length" :key="json" :class="$style.diagnostics" open>
                  <summary>
                    {{ t('validation.title') }} <span :class="$style.diagnosticCount">{{ result.diagnostics.length }}</span>
                  </summary>
                  <div :class="$style.diagnosticTable">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">{{ t('validation.path') }}</th>
                          <th scope="col">{{ t('validation.code') }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(item, index) in result.diagnostics" :key="index">
                          <td>{{ item.path || '$' }}</td>
                          <td>{{ item.code }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </details>
                <p v-else :class="$style.pass">{{ t('validation.pass') }}</p>

                <div v-if="result.encodingError" :class="$style.error" role="status">
                  <strong>{{ t('result.encodingFailed') }}</strong>
                  <p>{{ result.encodingError }}</p>
                </div>

                <OptionsPanel id="generate-options" v-model="form.options" scope="generate" :format="view === 'lrc' || view === 'ttml' ? view : null">
                  <div :class="$style.viewTabsButtons">
                    <button id="preview-switch" type="button" :aria-pressed="view === 'preview'" @click="view = 'preview'">
                      {{ t('result.preview') }}
                    </button>
                    <button id="json-switch" type="button" :aria-pressed="view === 'json'" @click="view = 'json'">JSON</button>
                    <button id="lrc-switch" type="button" :aria-pressed="view === 'lrc'" @click="view = 'lrc'">LRC</button>
                    <button id="ttml-switch" type="button" :aria-pressed="view === 'ttml'" @click="view = 'ttml'">TTML</button>
                  </div>
                </OptionsPanel>

                <div v-if="view === 'preview'" id="result-preview" :class="$style.resultContent">
                  <ResultView :lyric="result.lyric" />
                </div>
                <div v-else-if="view === 'json'" :class="$style.jsonView">
                  <pre id="result-json" :class="$style.jsonCode" tabindex="0" @keydown="selectAllIn($event)">{{ json }}</pre>
                </div>
                <div v-else-if="view === 'lrc'" :class="$style.jsonView">
                  <pre id="result-lrc" :class="$style.jsonCode" tabindex="0" @keydown="selectAllIn($event)">{{ lrcText }}</pre>
                </div>
                <div v-else :class="$style.jsonView">
                  <div v-if="ttml?.error" :class="$style.error" role="alert">
                    <strong>{{ t('result.ttmlGenerationFailed') }}</strong>
                    <p>{{ ttml.error }}</p>
                  </div>
                  <pre v-else id="result-ttml" :class="$style.jsonCode" tabindex="0" @keydown="selectAllIn($event)">{{ ttml?.text }}</pre>
                </div>
              </div>
            </template>
            <div v-else :class="$style.empty" aria-live="polite">
              <h3 :class="$style.emptyTitle">{{ t('result.empty') }}</h3>
            </div>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { LyricStatus, Timing, WordType } from '@gondola-lyrics/model/runtime'
import { computed, onMounted, ref } from 'vue'

import OptionsPanel from './components/options-panel.vue'
import ResultView from './components/result-view.vue'
import { useI18n } from './composables/useI18n'
import { useParser } from './composables/useParser'
import { formatBytes } from './lib/format'

const { locale, t, setLocale } = useI18n()
const { form, result, parsing, error, errorDetail, storageAvailable, json, lrc, ttml } = useParser()
const view = ref<'preview' | 'json' | 'lrc' | 'ttml'>('preview')

/**
 * Annotations live in their own LRC files, so they are labelled to keep the sections apart.
 */
const lrcText = computed(() => {
  const generated = lrc.value
  if (!generated) {
    return ''
  }
  const sections = [generated.original]
  if (generated.translations) {
    sections.push(`; translations\n${generated.translations}`)
  }
  if (generated.romans) {
    sections.push(`; romans\n${generated.romans}`)
  }
  return sections.filter(Boolean).join('\n\n')
})

const statusLabel = computed(() => {
  if (result.value?.lyric.status === LyricStatus.VALID) {
    return t('result.valid')
  }
  return t(result.value?.lyric.status === LyricStatus.INVALID ? 'result.invalid' : 'result.unspecified')
})
const timingLabel = computed(() => {
  switch (result.value?.lyric.timing) {
    case Timing.WORD:
      return t('result.wordTiming')
    case Timing.LINE:
      return t('result.lineTiming')
    case Timing.NONE:
      return t('result.noTiming')
    default:
      return t('result.unspecified')
  }
})
const wordCount = computed(() => {
  let count = 0
  for (const line of result.value?.lyric.lines ?? []) {
    for (const word of line.content?.words ?? []) {
      if (word.type === WordType.NORMAL) {
        count++
      }
    }
  }
  return count
})

const timingSummary = computed(() => {
  const parts = [timingLabel.value, `${result.value?.lyric.lines.length ?? 0} ${t('result.lineUnit')}`]
  if (wordCount.value) {
    parts.push(`${wordCount.value} ${t('result.wordUnit')}`)
  }
  return parts.join(' - ')
})

const toggleLocale = () => {
  setLocale(locale.value === 'zh-CN' ? 'en' : 'zh-CN')
}

/**
 * Select only the focused code block on Ctrl/Cmd+A instead of the whole page.
 */
const selectAllIn = (event: KeyboardEvent) => {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'a') {
    return
  }
  const target = event.currentTarget
  if (!(target instanceof HTMLElement)) {
    return
  }
  event.preventDefault()
  const selection = window.getSelection()
  if (!selection) {
    return
  }
  const range = document.createRange()
  range.selectNodeContents(target)
  selection.removeAllRanges()
  selection.addRange(range)
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

  /* Pin the wash to the viewport so switching preview/JSON cannot stretch it. */
  &::before {
    content: '';
    position: fixed;
    inset: 0;
    z-index: -1;
    background: linear-gradient(180deg, #f8fbfe 0%, #f1f7fc 42%, #f1f7fc 100%);
    pointer-events: none;
  }
}

.frame {
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  padding: 0 clamp(20px, 4vw, 64px) 72px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 74px;
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 13px;
  min-width: 0;
}

.wordmark {
  color: var(--text);
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.03em;
}

.locale {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 0;
  border: 0;
  background: none;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.08em;

  span {
    padding-bottom: 2px;
    border-bottom: 1px solid transparent;
  }
}

.localeActive {
  color: var(--primary-deep);
  border-bottom-color: var(--primary) !important;
}

.localeSlash {
  color: var(--line);
}

.main {
  display: flex;
  flex-direction: column;
}

.block {
  display: block;
  padding: 34px 0;
}

.body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.modeTabs {
  display: flex;
  align-items: center;
  gap: 26px;

  button {
    min-height: 44px;
    padding: 10px 0;
    border: 0;
    background: none;
    color: var(--muted);
    font-size: 13px;
    transition: color 120ms ease;

    &:hover {
      color: var(--primary-deep);
    }

    &[aria-selected='true'] {
      color: var(--primary-deep);
      font-weight: 550;
    }
  }
}

.editorShell {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 0 0 6px 6px;
  background: #fff;
}

/* Tracks sit inside the source shell, so the whole input reads as one field rather than stacked boxes. */
.trackSection {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-top: 1px solid var(--line);
  background: #fcfdff;
}

.trackCell {
  display: flex;
  flex-direction: column;
  min-width: 0;

  & + & {
    border-left: 1px solid var(--line);
  }
}

.trackLabel {
  padding: 10px 16px 0;
  color: var(--muted);
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.editor {
  display: block;
  flex: 1;
  width: 100%;
  min-height: 260px;
  resize: vertical;
  padding: 18px 16px;
  border: 0;
  background: #fcfdff;
  color: #1c3b54;
  font: 12.5px / 1.9 var(--mono);
  tab-size: 2;

  &:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px rgb(43 127 174 / 28%);
  }

  &::placeholder {
    color: #8ba1b4;
  }
}

/* Track editors share the main editor's styling but stay shorter, and resizing one would break the pair's alignment. */
.trackEditor {
  min-height: 130px;
  resize: none;
}

.warning {
  margin: 0;
  color: #8a5a17;
  font-size: 11px;
}

.viewTabsButtons {
  display: flex;
  align-items: center;
  gap: 22px;

  button {
    min-height: 44px;
    padding: 10px 0;
    border: 0;
    background: none;
    color: var(--muted);
    font-size: 12px;
    transition: color 120ms ease;

    &:hover {
      color: var(--primary-deep);
    }

    &[aria-pressed='true'] {
      color: var(--primary-deep);
      font-weight: 550;
    }
  }
}

.resultCard {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
}

.summary {
  display: flex;
  flex-wrap: wrap;
  overflow: hidden;
  border-bottom: 1px solid var(--line);
  background: #fff;
}

.status,
.summaryItem {
  display: inline-flex;
  align-items: center;
  padding: 9px 14px;
  border-right: 1px solid var(--line);
  font-size: 11px;
  white-space: nowrap;
}

.status {
  gap: 7px;
  color: var(--primary-deep);
  font-weight: 600;
}

.statusWarn {
  color: #8a5a17;
}

.summaryItem {
  color: var(--muted);

  &:last-child {
    border-right: 0;
  }
}

.summaryTiming {
  display: block;
  min-width: 0;
  max-width: 100%;
  white-space: normal;
}

.version {
  margin-left: auto;
}

.mono {
  font-family: var(--mono);
}

.error {
  padding: 12px 14px;
  border: 1px solid #f0d7dc;
  border-radius: 6px;
  background: #fff7f8;
  color: #8f3548;
  font-size: 12px;
  overflow-wrap: anywhere;

  p {
    margin: 5px 0 0;
  }
}

.diagnostics {
  padding: 12px 14px;
  border-bottom: 1px solid #efe0c2;
  background: #fffbf1;

  summary {
    color: #7c5417;
    font-size: 12px;
    cursor: pointer;
  }
}

.diagnosticCount {
  margin-left: 6px;
  font-family: var(--mono);
}

.diagnosticTable {
  max-height: 220px;
  margin-top: 10px;
  overflow: auto;
  border-radius: 4px;

  table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    font-size: 11px;
  }

  th,
  td {
    padding: 6px 8px;
    border-bottom: 1px solid #efe3cc;
    vertical-align: top;
  }

  th {
    color: #7c5417;
    font-weight: 500;
  }

  td {
    font-family: var(--mono);
    overflow-wrap: anywhere;
  }
}

.pass {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
  color: var(--muted);
  font-size: 11px;
}

.resultContent {
  --result-pad: 14px;

  min-width: 0;
  padding: 24px var(--result-pad) 18px;
}

.jsonView {
  min-width: 0;
}

.jsonCode {
  max-height: 620px;
  margin: 0;
  padding: 16px 14px;
  overflow: auto;
  border: 0;
  border-radius: 0;
  background: #fbfdff;
  color: #1c3b54;
  font: 11px / 1.7 var(--mono);
  tab-size: 2;
  /* Keep selection inside the code block so the page's other text is not swept in. */
  user-select: text;
  white-space: pre;
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 140px;
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
}

.emptyTitle {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  font-weight: 450;
}

.visuallyHidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (max-width: 820px) {
  .frame {
    padding: 0 20px 48px;
  }

  .block {
    padding: 30px 0;
  }

  .editor {
    min-height: 240px;
    padding: 14px;
    /* 16px keeps iOS from zooming the viewport when the editor receives focus. */
    font-size: 16px;
    line-height: 1.65;
  }

  .resultContent {
    --result-pad: 16px;

    padding: 18px var(--result-pad);
  }
}

@media (max-width: 520px) {
  .frame {
    padding: 0 16px 40px;
  }

  .topbar {
    min-height: 62px;
  }

  .brand {
    gap: 9px;
  }

  .wordmark {
    font-size: 15px;
  }

  .locale {
    padding: 10px 0;
  }

  .block {
    padding: 26px 0;
  }

  .editor {
    min-height: 210px;
    padding: 12px;
  }

  .trackSection {
    grid-template-columns: minmax(0, 1fr);
  }

  .trackCell + .trackCell {
    border-top: 1px solid var(--line);
    border-left: 0;
  }

  .trackEditor {
    min-height: 120px;
  }

  .modeTabs {
    gap: 18px;
  }

  .viewTabsButtons {
    gap: 8px;
  }

  .summary {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1px;
    overflow: hidden;
    background: var(--line);
  }

  .status,
  .summaryItem {
    border-right: 0;
    background: #fff;
    padding: 9px 12px;
    font-size: 11px;
  }

  .summaryItem {
    min-width: 0;
    overflow-wrap: anywhere;
    white-space: normal;
  }

  .status {
    grid-column: 1 / -1;
  }

  .version {
    margin-left: 0;
  }

  .resultContent {
    --result-pad: 12px;

    padding: 16px var(--result-pad);
  }

  .jsonView {
    padding: 12px;
  }

  .diagnostics,
  .error {
    padding: 10px 12px;
  }

  .jsonCode {
    max-height: 60vh;
    padding: 12px;
    font-size: 10.5px;
  }

  .empty {
    min-height: 160px;
    padding: 22px 0;
  }

  .diagnosticTable {
    max-height: 45vh;
  }
}
</style>
