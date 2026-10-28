import { defineConfig } from 'vitest/config'

const coreSrc = decodeURIComponent(new URL('../core/src/', import.meta.url).pathname)

export default defineConfig({
  resolve: {
    alias: [{ find: /^@pulls\.review\/core\/(.+)$/, replacement: `${coreSrc}$1.ts` }],
  },
  test: {
    environment: 'node',
  },
})
