import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const root = import.meta.dirname
const repository = resolve(root, '..')

export default defineConfig({
  root,
  base: '/kit-node/',
  plugins: [vue()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@gondola-lyrics/kit': resolve(repository, 'src'),
      '@rules': resolve(repository, 'rules'),
    },
  },
  optimizeDeps: {
    exclude: ['@gondola-lyrics/kit'],
  },
})
