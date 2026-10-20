import Vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'
import { coreAlias, features, fileRouter } from './vite.config.shared'

const { 'import.meta.env.PR_EMBED': _embedOff, ...define } = features({ llm: true, embed: false, local: true })

export default defineConfig({
  plugins: [fileRouter(true, false), Vue()],
  resolve: { alias: coreAlias },
  define,
  test: {
    name: 'app-local',
    environment: 'happy-dom',
    include: ['src/local/pages.test.ts'],
    root: import.meta.dirname,
  },
})
