# Gondola Lyric Kit For Node

Gondola lyrics toolkit: parses and generates lyric.

## Installation

```bash
npm install @gondola-lyrics/kit
```

## Supports

| Format | Line level | Word level | Annotation | Meta |
| ------ | ---------- | ---------- | ---------- | ---- |
| LRC    | ✅         | ✅         | ✅         | ✅   |
| TTML   | ✅         | ✅         | ✅         | ✅   |

## Usage

> [!IMPORTANT]
> This package is ESM-only.
> In your TS config, use `module: node20` / `module: nodenext` / `moduleResolution: bundler`.

Parsing returns a canonical `runtime.Lyric` together with the diagnostics it produced, so the result is ready to hand to a player without a second conversion step.

### Parse

```ts
import { parse, parseLrc } from '@gondola-lyrics/kit'

const content = `[00:01.00]Like the first time tangled by the fishing line`
const parsed = parse(content)

parsed?.lyric.format // => 'lrc'
parsed?.lyric.lines[0]?.time?.start // => 1000
parsed?.diagnostics // => []

// `parse` recognizes the format and returns `null` when it cannot.
// `parseLrc` takes a known format and never returns `null`, so an unreadable source only carries `status: INVALID`.
parseLrc('no timestamps here').lyric.status // => LyricStatus.INVALID

// LRC keeps translations and romanizations in separate files, attached here by timestamp.
const annotated = parseLrc({
  original: `[00:01.00]Like the first time
[00:03.00]tangled by the line`,
  translations: `[00:01.00]就像第一次
[00:03.00]被渔线缠住那样`,
  romans: `[00:01.00]raiku za fasuto taimu
[00:03.00]tanguru do bai za rain`,
})

annotated.lyric.lines[0]?.annotation?.translations[0].text // => '就像第一次'
annotated.lyric.lines[0]?.annotation?.romans[0].text // => 'raiku za fasuto taimu'

// An exact timestamp match is assigned before any fuzzy one, and rows matching no line are dropped.
// A drifting track attaches within a tolerance, where the nearest unclaimed line wins.
const drifted = {
  original: `[00:01.00]Like the first time
[00:03.00]tangled by the line`,
  translations: `[00:01.30]就像第一次
[00:03.20]被渔线缠住那样`,
}

parseLrc(drifted).lyric.lines[0]?.annotation // => undefined
parseLrc(drifted, { annotationTolerance: 500 }).lyric.lines[0]?.annotation?.translations[0].text // => '就像第一次'
```

Every parser canonicalizes its lyric and validates the result before returning, so `lyric` is already in canonical order and `diagnostics` is exactly what `@gondola-lyrics/model` reports for it.

### Generate

`generate` takes the target format explicitly, so a lyric parsed from one format can be written out as another.

```ts
import { generate, parseLrc } from '@gondola-lyrics/kit'

const { lyric } = parseLrc('[00:01.00]Like the first time')

// Separate tracks come back as separate fields, so the result parses again unchanged.
const { original, translations, romans } = generate(lyric, 'lrc')

parseLrc(generate(lyric, 'lrc')) // round-trips
```

`generateLrc` is the same thing without the dispatch step.

### Detect

```ts
import { detectFormat } from '@gondola-lyrics/kit'

detectFormat('[00:01.00]Like the first time') // => 'lrc'
detectFormat('plain text without timestamps') // => undefined
```

Detection reads only the original text. It answers whether the source is recognizable, not whether it is valid: a recognized source can still parse into an `INVALID` lyric.

### Validation

The kit does not invent diagnostics. It canonicalizes the lyric and hands back exactly what `@gondola-lyrics/model` reports for it.

```ts
const { lyric, diagnostics } = parseLrc(source)

// The same list, computed by the kit on the way out.
import { validateLyric } from '@gondola-lyrics/model/runtime'

validateLyric(lyric) // deep-equals `diagnostics`
```

### Entries

| Import                          | Contains   |
| ------------------------------- | ---------- |
| `@gondola-lyrics/kit`           | Everything |
| `@gondola-lyrics/kit/parser`    | Parsing    |
| `@gondola-lyrics/kit/generator` | Generation |

## Commands

**Build**

```bash
npm run build
```

**Check**

```bash
npm run check
npm run format
```

## License

[MIT](./LICENSE)
