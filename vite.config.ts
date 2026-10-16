import dts from 'vite-plugin-dts'

import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const root = import.meta.dirname
const src = resolve(root, 'src')
const out = resolve(root, 'dist')

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
      entry: {
        index: resolve(src, 'index.ts'),
        parser: resolve(src, 'parser.ts'),
        generator: resolve(src, 'generator.ts'),
        common: resolve(src, 'common/index.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      // Only the packages stay external; the entry modules are matched by resolved path, since matching them by the text `./parser` also catches a relative import that merely ends in it.
      external: (id) =>
        /^@gondola-lyrics\/model/.test(id) || /^@bufbuild\/protobuf/.test(id) || id === resolve(src, 'parser') || id === resolve(src, 'generator'),
      // Lets an entry chunk absorb the modules it shares, so no hashed chunk is emitted beside it.
      preserveEntrySignatures: 'allow-extension',
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        paths: { [resolve(src, 'parser')]: './parser.js', [resolve(src, 'generator')]: './generator.js' },
      },
    },
  },
})
