import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['packages/*', 'packages/app/vitest.local.config.ts'],
  },
})
