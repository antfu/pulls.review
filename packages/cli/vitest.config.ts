import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@pulls.review/core/llm': fileURLToPath(new URL('../core/src/llm.ts', import.meta.url)),
      '@pulls.review/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    name: 'cli',
    environment: 'node',
  },
})
