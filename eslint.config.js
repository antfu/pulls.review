// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu(
  {
    unocss: true,
    formatters: true,
    pnpm: true,
    antislop: true,
    ignores: [
      'packages/app/src/components/diff/pierre-diffs-core.css',
      'packages/app/test/fixtures/real/**',
      '**/__snapshots__/**',
    ],
  },
)
