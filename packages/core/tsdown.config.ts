import { defineConfig } from 'tsdown'

/** One entry per public subpath - see `exports` in package.json. */
export default defineConfig({
  entry: ['src/types.ts', 'src/patch-parser.ts', 'src/github.ts', 'src/paste.ts', 'src/analyze.ts', 'src/llm.ts', 'src/diagnostics.ts', 'src/locales.ts'],
  platform: 'neutral',
  dts: true,
})
