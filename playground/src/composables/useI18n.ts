import { ref } from 'vue'

const EN = {
  'app.language': 'Change language',
  'input.title': 'Source lyrics',
  'input.label': 'LRC source',
  'input.storage': 'Browser storage is unavailable. Your input will not be saved.',
  'input.translations': 'Translations',
  'input.romans': 'Romanizations',
  'settings.title': 'Processing',
  'settings.mode': 'Parser mode',
  'settings.auto': 'Auto',
  'settings.lrc': 'LRC',
  'result.title': 'Parsed result',
  'result.preview': 'Preview',
  'result.json': 'JSON',
  'result.empty': 'Empty result',
  'result.metadata': 'Metadata',
  'result.lines': 'Lyric lines',
  'result.lineUnit': 'lines',
  'result.wordUnit': 'words',
  'result.noLines': 'No content.',
  'result.emptyLine': 'Empty timed line',
  'result.instrumental': 'Instrumental',
  'result.background': 'Background vocals',
  'result.languages': 'Languages',
  'result.agents': 'Performers',
  'result.valid': 'Parsed',
  'result.invalid': 'Invalid source',
  'result.unspecified': 'Unspecified',
  'result.lineTiming': 'Line timing',
  'result.wordTiming': 'Word timing',
  'result.noTiming': 'Untimed',
  'result.elapsed': 'Processing time includes parsing, canonicalization, validation and encoding.',
  'result.size': 'UTF-8 source → Protobuf bytes. This is not a compression ratio.',
  'result.encodingFailed': 'The model could not be encoded.',
  'validation.title': 'Diagnostics',
  'validation.pass': 'Validation passed',
  'validation.path': 'Path',
  'validation.code': 'Code',
  'error.empty': 'Enter some lyrics first.',
  'error.unrecognized': 'Unrecognized format.',
  'error.unexpected': 'Processing failed.',
  'meta.title': 'Title',
  'meta.artist': 'Artist',
  'meta.album': 'Album',
  'meta.author': 'Transcriber',
  'meta.duration': 'Duration',
  'meta.offset': 'Offset',
  'meta.language': 'Language',
} as const

const ZH: Record<MessageKey, string> = {
  'app.language': '切换语言',
  'input.title': '歌词输入',
  'input.label': 'LRC 原文',
  'input.storage': '浏览器存储不可用，当前输入不会被保存。',
  'input.translations': '翻译',
  'input.romans': '音译',
  'settings.title': '处理选项',
  'settings.mode': '解析模式',
  'settings.auto': '自动',
  'settings.lrc': 'LRC',
  'result.title': '解析结果',
  'result.preview': '预览',
  'result.json': 'JSON',
  'result.empty': '空结果',
  'result.metadata': '元数据',
  'result.lines': '歌词行',
  'result.lineUnit': '行',
  'result.wordUnit': '词',
  'result.noLines': '无内容',
  'result.emptyLine': '空时间行',
  'result.instrumental': '间奏',
  'result.background': '背景人声',
  'result.languages': '语言',
  'result.agents': '演唱者',
  'result.valid': '解析成功',
  'result.invalid': '无有效歌词行',
  'result.unspecified': '未指定',
  'result.lineTiming': '逐行时间',
  'result.wordTiming': '逐词时间',
  'result.noTiming': '无时间信息',
  'result.elapsed': '处理耗时包含解析、规范化、模型校验及编码。',
  'result.size': 'UTF-8 原始输入 → Protobuf 编码体积，不代表压缩率。',
  'result.encodingFailed': '编码失败',
  'validation.title': '校验提示',
  'validation.pass': '校验通过',
  'validation.path': '路径',
  'validation.code': '规则',
  'error.empty': '请先输入歌词。',
  'error.unrecognized': '无法识别的格式',
  'error.unexpected': '处理失败。',
  'meta.title': '标题',
  'meta.artist': '歌手',
  'meta.album': '专辑',
  'meta.author': '录入者',
  'meta.duration': '时长',
  'meta.offset': '偏移',
  'meta.language': '语言',
}

export type MessageKey = keyof typeof EN
export type Locale = 'zh-CN' | 'en'

const STORAGE_KEY = 'gondola-playground-locale'
const readLocale = (): Locale => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'zh-CN'
  } catch {
    return 'zh-CN'
  }
}
const locale = ref<Locale>(readLocale())

/**
 * Share the selected locale across panels without coupling it to parser state.
 */
export const useI18n = () => {
  const t = (key: MessageKey): string => {
    return locale.value === 'en' ? EN[key] : ZH[key]
  }
  const setLocale = (next: Locale) => {
    locale.value = next
    document.documentElement.lang = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Language switching should still work when browser storage is blocked.
    }
  }
  return { locale, t, setLocale }
}
