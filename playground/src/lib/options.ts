import type {
  DeriveWordEmphasisOptions,
  ExtractBackgroundLinesOptions,
  InsertInstrumentalLinesOptions,
  InsertSpacesOptions,
  InsertSpacesRule,
  LrcGenerateOptions,
  LrcParseOptions,
  TtmlGenerateOptions,
  TtmlParseOptions,
} from '@gondola-lyrics/kit'

import { InsertSpacesRules } from '@gondola-lyrics/kit'

const ALL_SPACE_RULES = Object.values(InsertSpacesRules) as InsertSpacesRule[]

export interface PlaygroundOptions {
  parse: {
    lrc: Required<LrcParseOptions>
    ttml: Required<TtmlParseOptions>
  }
  transforms: {
    instrumental: Required<Omit<InsertInstrumentalLinesOptions, 'endTime'>> & Pick<InsertInstrumentalLinesOptions, 'endTime'> & { enabled: boolean }
    emphasis: Required<DeriveWordEmphasisOptions> & { enabled: boolean }
    extract: Required<ExtractBackgroundLinesOptions> & { enabled: boolean }
    brackets: { enabled: boolean }
    spaces: Required<Omit<InsertSpacesOptions, 'rules'>> & { enabled: boolean; rules: InsertSpacesRule[] }
  }
  generate: {
    lrc: Required<LrcGenerateOptions>
    ttml: Omit<Required<TtmlGenerateOptions>, 'profile'> & { profile: 'auto' | NonNullable<TtmlGenerateOptions['profile']> }
  }
}

export type OptionOverrides = {
  [Scope in keyof PlaygroundOptions]?: {
    [Group in keyof PlaygroundOptions[Scope]]?: Partial<PlaygroundOptions[Scope][Group]>
  }
}

/**
 * Leave transforms opt-in and source-dependent TTML defaults to the generator.
 */
export const createOptions = (): PlaygroundOptions => {
  return {
    parse: {
      lrc: { annotationTolerance: 0 },
      ttml: { language: '' },
    },
    transforms: {
      instrumental: { enabled: false, minDuration: 10000, minIntroDuration: 5000, endTime: undefined },
      emphasis: { enabled: false, durationThreshold: 3000 },
      extract: { enabled: false, fullLine: true, inLine: true, crossLine: true },
      brackets: { enabled: false },
      spaces: { enabled: false, annotations: true, rules: [...ALL_SPACE_RULES] },
    },
    generate: {
      lrc: {
        wordTiming: 'angle',
        timeFormat: 'mm:ss.SSS',
        includeMeta: true,
        includeWordEnd: false,
        includeInstrumental: true,
      },
      ttml: { profile: 'auto', indent: false, includeMeta: true },
    },
  }
}

const readObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

const readString = (value: unknown, fallback: string): string => {
  return typeof value === 'string' ? value : fallback
}

const readBoolean = (value: unknown, fallback: boolean): boolean => {
  return typeof value === 'boolean' ? value : fallback
}

const isMilliseconds = (value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number => {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum
}

const readChoice = <Choice extends string>(value: unknown, choices: readonly Choice[], fallback: Choice): Choice => {
  return (
    choices.find((choice) => {
      return choice === value
    }) ?? fallback
  )
}

/**
 * Reports whether a rule list already covers every rule, in which case there is nothing to persist.
 */
const isDefaultRules = (rules: InsertSpacesRule[]) => {
  return rules.length === ALL_SPACE_RULES.length
}

/**
 * Keeps the saved rules that are still known, falling back to every rule when none survive.
 */
const readRules = (value: unknown): InsertSpacesRule[] => {
  if (!Array.isArray(value)) {
    return [...ALL_SPACE_RULES]
  }
  const kept = value.filter((item): item is InsertSpacesRule => {
    return typeof item === 'string' && ALL_SPACE_RULES.includes(item as InsertSpacesRule)
  })
  return kept.length ? kept : [...ALL_SPACE_RULES]
}

/**
 * Restore older or partial saved settings and isolate in-flight work from subsequent edits.
 * Empty or invalid numeric inputs use their defaults; an unknown outro end stays unset.
 */
export const readOptions = (value: unknown): PlaygroundOptions => {
  const defaults = createOptions()
  const saved = readObject(value)
  const parse = readObject(saved.parse)
  const transforms = readObject(saved.transforms)
  const generate = readObject(saved.generate)
  const lrcParse = readObject(parse.lrc)
  const ttmlParse = readObject(parse.ttml)
  const instrumental = readObject(transforms.instrumental)
  const emphasis = readObject(transforms.emphasis)
  const extract = readObject(transforms.extract)
  const brackets = readObject(transforms.brackets)
  const spaces = readObject(transforms.spaces)
  const lrcGenerate = readObject(generate.lrc)
  const ttmlGenerate = readObject(generate.ttml)
  const tolerance = lrcParse.annotationTolerance
  const timeFormat = readString(lrcGenerate.timeFormat, defaults.generate.lrc.timeFormat)

  return {
    parse: {
      lrc: {
        annotationTolerance:
          typeof tolerance === 'number' && Number.isFinite(tolerance) ? Math.max(0, tolerance) : defaults.parse.lrc.annotationTolerance,
      },
      ttml: { language: readString(ttmlParse.language, defaults.parse.ttml.language).trim() },
    },
    transforms: {
      instrumental: {
        enabled: readBoolean(instrumental.enabled, defaults.transforms.instrumental.enabled),
        minDuration: isMilliseconds(instrumental.minDuration) ? instrumental.minDuration : defaults.transforms.instrumental.minDuration,
        minIntroDuration: isMilliseconds(instrumental.minIntroDuration)
          ? instrumental.minIntroDuration
          : defaults.transforms.instrumental.minIntroDuration,
        endTime: isMilliseconds(instrumental.endTime, 2 ** 31 - 1) ? instrumental.endTime : undefined,
      },
      emphasis: {
        enabled: readBoolean(emphasis.enabled, defaults.transforms.emphasis.enabled),
        durationThreshold: isMilliseconds(emphasis.durationThreshold) ? emphasis.durationThreshold : defaults.transforms.emphasis.durationThreshold,
      },
      extract: {
        enabled: readBoolean(extract.enabled, defaults.transforms.extract.enabled),
        fullLine: readBoolean(extract.fullLine, defaults.transforms.extract.fullLine),
        inLine: readBoolean(extract.inLine, defaults.transforms.extract.inLine),
        crossLine: readBoolean(extract.crossLine, defaults.transforms.extract.crossLine),
      },
      brackets: {
        enabled: readBoolean(brackets.enabled, defaults.transforms.brackets.enabled),
      },
      spaces: {
        enabled: readBoolean(spaces.enabled, defaults.transforms.spaces.enabled),
        annotations: readBoolean(spaces.annotations, defaults.transforms.spaces.annotations),
        rules: readRules(spaces.rules),
      },
    },
    generate: {
      lrc: {
        wordTiming: readChoice(lrcGenerate.wordTiming, ['angle', 'bracket', 'none'], defaults.generate.lrc.wordTiming),
        timeFormat: timeFormat.trim() ? timeFormat : defaults.generate.lrc.timeFormat,
        includeMeta: readBoolean(lrcGenerate.includeMeta, defaults.generate.lrc.includeMeta),
        includeWordEnd: readBoolean(lrcGenerate.includeWordEnd, defaults.generate.lrc.includeWordEnd),
        includeInstrumental: readBoolean(lrcGenerate.includeInstrumental, defaults.generate.lrc.includeInstrumental),
      },
      ttml: {
        profile: readChoice(ttmlGenerate.profile, ['auto', 'amll', 'itunes'], defaults.generate.ttml.profile),
        indent: readBoolean(ttmlGenerate.indent, defaults.generate.ttml.indent),
        includeMeta: readBoolean(ttmlGenerate.includeMeta, defaults.generate.ttml.includeMeta),
      },
    },
  }
}

const pickOverrides = <Options extends object>(value: Options, defaults: Options): Partial<Options> | undefined => {
  const overrides: Partial<Options> = {}
  for (const key of Object.keys(defaults) as (keyof Options)[]) {
    if (value[key] !== defaults[key]) {
      overrides[key] = value[key]
    }
  }
  return Object.keys(overrides).length ? overrides : undefined
}

/**
 * Persist only overrides so untouched settings continue to follow the API defaults.
 */
export const getOptionOverrides = (value: PlaygroundOptions): OptionOverrides | undefined => {
  const options = readOptions(value)
  const defaults = createOptions()
  const lrcParse = pickOverrides(options.parse.lrc, defaults.parse.lrc)
  const ttmlParse = pickOverrides(options.parse.ttml, defaults.parse.ttml)
  const instrumental = pickOverrides(options.transforms.instrumental, defaults.transforms.instrumental)
  const emphasis = pickOverrides(options.transforms.emphasis, defaults.transforms.emphasis)
  const extract = pickOverrides(options.transforms.extract, defaults.transforms.extract)
  const brackets = pickOverrides(options.transforms.brackets, defaults.transforms.brackets)
  const spaces = pickOverrides({ ...options.transforms.spaces, rules: undefined }, { ...defaults.transforms.spaces, rules: undefined })
  const spaceRules = isDefaultRules(options.transforms.spaces.rules) ? undefined : { rules: options.transforms.spaces.rules }
  const lrcGenerate = pickOverrides(options.generate.lrc, defaults.generate.lrc)
  const ttmlGenerate = pickOverrides(options.generate.ttml, defaults.generate.ttml)
  const overrides: OptionOverrides = {}

  if (lrcParse || ttmlParse) {
    overrides.parse = {
      ...(lrcParse ? { lrc: lrcParse } : {}),
      ...(ttmlParse ? { ttml: ttmlParse } : {}),
    }
  }
  if (instrumental || emphasis || extract || brackets || spaces || spaceRules) {
    overrides.transforms = {
      ...(instrumental ? { instrumental } : {}),
      ...(emphasis ? { emphasis } : {}),
      ...(extract ? { extract } : {}),
      ...(brackets ? { brackets } : {}),
      ...(spaces || spaceRules ? { spaces: { ...spaces, ...spaceRules } } : {}),
    }
  }
  if (lrcGenerate || ttmlGenerate) {
    overrides.generate = {
      ...(lrcGenerate ? { lrc: lrcGenerate } : {}),
      ...(ttmlGenerate ? { ttml: ttmlGenerate } : {}),
    }
  }
  return Object.keys(overrides).length ? overrides : undefined
}
