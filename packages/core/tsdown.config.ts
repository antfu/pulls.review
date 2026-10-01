import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/llm.ts'],
  platform: 'neutral',
  dts: true,
})
