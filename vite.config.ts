import dts from 'vite-plugin-dts'

import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const root = import.meta.dirname
const src = resolve(root, 'src')
const out = resolve(root, 'dist')

const entrySrc = resolve(src, 'entry')

export default defineConfig({
  resolve: {
    alias: {
      '@root': src,
    },
  },
  plugins: [
    dts({
      tsconfigPath: resolve(root, 'tsconfig.json'),
      include: ['src'],
      bundleTypes: true,
      outDirs: [{ dir: out }],
    }),
  ],
  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    reportCompressedSize: false,
    lib: {
      // `common` is built so the shared code lands in one chunk the others import; it is not published.
      entry: {
        index: resolve(entrySrc, 'index.ts'),
        parser: resolve(entrySrc, 'parser.ts'),
        generator: resolve(entrySrc, 'generator.ts'),
        common: resolve(src, 'common/index.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [/^@gondola-lyrics\/model/, /^@bufbuild\/protobuf/, './parser', './generator'],
      // Lets an entry chunk absorb the modules it shares, so no hashed chunk is emitted beside it.
      preserveEntrySignatures: 'allow-extension',
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        paths: { [resolve(entrySrc, 'parser')]: './parser.js', [resolve(entrySrc, 'generator')]: './generator.js' },
      },
    },
  },
})
