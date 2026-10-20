import Vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'
import { coreAlias, features, fileRouter } from './vite.config.shared'

// Vitest surfaces defines through `process.env` as strings, so a defined `PR_EMBED` or
// `PR_LOCAL` of `false` would arrive as the truthy string "false". Drop them so they read
// undefined (falsy) here; the embed test opts in with `vi.stubEnv('PR_EMBED', 'true')`.
const { 'import.meta.env.PR_EMBED': _embedOff, 'import.meta.env.PR_LOCAL': _localOff, ...define } = features({ llm: true, embed: false })

export default defineConfig({
  plugins: [fileRouter(false, false), Vue()],
  resolve: { alias: coreAlias },
  define,
  test: {
    name: 'app',
    environment: 'happy-dom',
    exclude: ['**/node_modules/**', '**/dist/**', '**/local/pages.test.ts'],
  },
})
