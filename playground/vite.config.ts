import vue from '@vitejs/plugin-vue'

import { resolve } from 'node:path'
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
    },
  },
  optimizeDeps: {
    exclude: ['@gondola-lyrics/kit'],
  },
})
