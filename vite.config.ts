import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

const root = import.meta.dirname
const src = resolve(root, 'src')
const out = resolve(root, 'dist')

export default defineConfig({
  resolve: {
    alias: {
      '@root': src,
      '@rules': resolve(root, 'rules'),
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
        // Internal entries keep shared code in one chunk instead of copying it into each public entry.
        formats: resolve(src, 'formats/index.ts'),
        transforms: resolve(src, 'transforms/index.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      // Match entry modules by absolute path to avoid treating unrelated relative imports as public entries.
      external: (id) => {
        return (
          /^@gondola-lyrics\/model/.test(id) || /^@bufbuild\/protobuf/.test(id) || id === resolve(src, 'parser') || id === resolve(src, 'generator')
        )
      },
      // Allow shared modules in entry chunks to avoid emitting extra shared chunks.
      preserveEntrySignatures: 'allow-extension',
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        paths: {
          [resolve(src, 'parser')]: './parser.js',
          [resolve(src, 'generator')]: './generator.js',
        },
      },
    },
  },
})
