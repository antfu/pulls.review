import Vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'
import { coreAlias, features } from './vite.config.shared'

// Vitest surfaces defines through `process.env` as strings, so a defined `PR_EMBED` of
// `false` would arrive as the truthy string "false". Drop it so it reads undefined
// (falsy) here, matching how the other flags' off-state is left unset; the embed test
// opts in with `vi.stubEnv('PR_EMBED', 'true')`.
const { 'import.meta.env.PR_EMBED': _embedOff, ...define } = features({ llm: true, embed: false })

export default defineConfig({
  plugins: [Vue()],
  resolve: { alias: coreAlias },
  define,
  test: {
    name: 'app',
    environment: 'happy-dom',
  },
})
