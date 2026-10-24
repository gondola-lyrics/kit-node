import type { LrcGenerateOptions, LrcParseOptions, TtmlGenerateOptions, TtmlParseOptions } from '@gondola-lyrics/kit'

export interface PlaygroundOptions {
  parse: {
    lrc: Required<LrcParseOptions>
    ttml: Required<TtmlParseOptions>
  }
  generate: {
    lrc: Required<LrcGenerateOptions>
    ttml: Omit<Required<TtmlGenerateOptions>, 'profile'> & { profile: 'auto' | NonNullable<TtmlGenerateOptions['profile']> }
  }
}

export type OptionOverrides = {
  [Scope in keyof PlaygroundOptions]?: {
    [Format in keyof PlaygroundOptions[Scope]]?: Partial<PlaygroundOptions[Scope][Format]>
  }
}

/**
 * Mirror the format APIs while leaving source-dependent TTML defaults to the generator.
 */
export const createOptions = (): PlaygroundOptions => {
  return {
    parse: {
      lrc: { annotationTolerance: 0 },
      ttml: { language: '' },
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

const readChoice = <Choice extends string>(value: unknown, choices: readonly Choice[], fallback: Choice): Choice => {
  return (
    choices.find((choice) => {
      return choice === value
    }) ?? fallback
  )
}

/**
 * Restore older or partial saved settings and isolate in-flight work from subsequent edits.
 * Empty numeric inputs fall back to exact annotation matching.
 */
export const readOptions = (value: unknown): PlaygroundOptions => {
  const defaults = createOptions()
  const saved = readObject(value)
  const parse = readObject(saved.parse)
  const generate = readObject(saved.generate)
  const lrcParse = readObject(parse.lrc)
  const ttmlParse = readObject(parse.ttml)
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
  const lrcGenerate = pickOverrides(options.generate.lrc, defaults.generate.lrc)
  const ttmlGenerate = pickOverrides(options.generate.ttml, defaults.generate.ttml)
  const overrides: OptionOverrides = {}

  if (lrcParse || ttmlParse) {
    overrides.parse = {
      ...(lrcParse ? { lrc: lrcParse } : {}),
      ...(ttmlParse ? { ttml: ttmlParse } : {}),
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
