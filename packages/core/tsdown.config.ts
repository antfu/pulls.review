import { defineConfig } from 'tsdown'

/** One entry per public subpath - see `exports` in package.json. */
export default defineConfig({
  entry: ['src/types.ts', 'src/cache.ts', 'src/patch-parser.ts', 'src/github.ts', 'src/paste.ts', 'src/analyze.ts', 'src/llm.ts', 'src/local.ts', 'src/diagnostics.ts', 'src/env.ts', 'src/locales.ts'],
  platform: 'neutral',
  dts: true,
})
