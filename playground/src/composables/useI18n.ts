import { ref } from 'vue'

const EN = {
  'app.language': 'Change language',
  'input.title': 'Source lyrics',
  'input.label': 'Source lyrics',
  'input.storage': 'Browser storage is unavailable. Your input and settings will not be saved.',
  'input.translations': 'Translations',
  'input.romans': 'Romanizations',
  'settings.title': 'Options',
  'settings.mode': 'Parser mode',
  'settings.auto': 'Auto',
  'settings.lrc': 'LRC',
  'settings.ttml': 'TTML',
  'settings.reset': 'Reset defaults',
  'settings.modified': 'Modified options',
  'settings.annotationTolerance': 'Annotation tolerance',
  'settings.annotationToleranceHint': 'Matches translation and romanization timestamps. 0 requires an exact match.',
  'settings.language': 'Fallback language',
  'settings.languageHint': 'Leave empty to use the document’s language. An explicit xml:lang takes priority.',
  'settings.wordTiming': 'Word timestamps',
  'settings.wordTimingAngle': 'Angle brackets <…>',
  'settings.wordTimingBracket': 'Square brackets […]',
  'settings.wordTimingNone': 'None',
  'settings.wordTimingBracketHint': 'Square brackets share the line timestamp syntax and are parsed as new lines.',
  'settings.timeFormat': 'Timestamp format',
  'settings.timeFormatHint': 'Use h, m, s and S for hours, minutes, seconds and decimals. Empty uses mm:ss.SSS.',
  'settings.includeMeta': 'Include metadata',
  'settings.includeInstrumental': 'Include instrumental lines',
  'settings.includeWordEnd': 'Include word duration',
  'settings.profile': 'TTML profile',
  'settings.profileAuto': 'Follow source (default)',
  'settings.profileHint': 'Follows the source TTML profile; other formats use AMLL.',
  'settings.indent': 'Indent document structure',
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
  'result.ttmlGenerationFailed': 'TTML generation failed.',
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
  'input.label': '歌词原文',
  'input.storage': '浏览器存储不可用，当前输入与设置不会被保存。',
  'input.translations': '翻译',
  'input.romans': '音译',
  'settings.title': '选项',
  'settings.mode': '解析模式',
  'settings.auto': '自动',
  'settings.lrc': 'LRC',
  'settings.ttml': 'TTML',
  'settings.reset': '恢复默认',
  'settings.modified': '已修改的选项',
  'settings.annotationTolerance': '匹配容差',
  'settings.annotationToleranceHint': '用于匹配翻译与音译的时间戳，0 表示精确匹配。',
  'settings.language': '默认语言',
  'settings.languageHint': '留空使用文档语言，文档中声明的 xml:lang 优先。',
  'settings.wordTiming': '逐词时间标签',
  'settings.wordTimingAngle': '尖括号 <…>',
  'settings.wordTimingBracket': '方括号 […]',
  'settings.wordTimingNone': '不输出',
  'settings.wordTimingBracketHint': '方括号与行时间标签相同，重新解析时会按歌词行处理。',
  'settings.timeFormat': '时间格式',
  'settings.timeFormatHint': '用 h、m、s、S 指定时、分、秒和小数位，留空使用 mm:ss.SSS。',
  'settings.includeMeta': '保留元数据',
  'settings.includeInstrumental': '保留间奏行',
  'settings.includeWordEnd': '输出词时长',
  'settings.profile': 'TTML profile',
  'settings.profileAuto': '跟随来源（默认）',
  'settings.profileHint': '跟随来源 TTML 的 profile，其他格式默认使用 AMLL。',
  'settings.indent': '缩进文档结构',
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
  'result.lineTiming': '逐行',
  'result.wordTiming': '逐词',
  'result.noTiming': '无时间信息',
  'result.elapsed': '处理耗时包含解析、规范化、模型校验及编码。',
  'result.size': 'UTF-8 原始输入 → Protobuf 编码体积，不代表压缩率。',
  'result.encodingFailed': '编码失败',
  'result.ttmlGenerationFailed': 'TTML 生成失败',
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
