import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/devframe.ts'],
  platform: 'node',
  dts: false,
})
