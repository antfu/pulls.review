import picomatch from 'picomatch'
import { describe, expect, it } from 'vitest'
import { defaultRules } from './rules'

function ruleKey(path: string): string {
  for (const rule of defaultRules) {
    if (rule.patterns && picomatch(rule.patterns)(path))
      return rule.key
  }
  return 'code'
}

describe('defaultRules', () => {
  it.each([
    ['src/foo.test.ts', 'tests'],
    ['src/__tests__/foo.ts', 'tests'],
    ['test/foo.ts', 'tests'],
    ['pkg/server_test.go', 'tests'],
    ['app/test_views.py', 'tests'],
    ['src/Button.stories.ts', 'tests'],
    ['src/__snapshots__/foo.ts.snap', 'tests'],
    ['e2e/login.ts', 'tests'],
    ['src/fixtures/pr.json', 'tests'],
    ['README.md', 'docs'],
    ['docs/guide.mdx', 'docs'],
    ['package.json', 'deps'],
    // Lockfiles are machine-generated, not a dependency manifest a reviewer edits.
    ['pnpm-lock.yaml', 'generated'],
    ['.eslintrc.json', 'config'],
    ['.github/workflows/ci.yml', 'config'],
    ['tsconfig.json', 'config'],
    ['Dockerfile', 'config'],
    ['vite.config.ts', 'config'],
    ['dist/bundle.js', 'generated'],
    ['schema.generated.ts', 'generated'],
    ['src/index.ts', 'code'],
  ])('files %s under the %s rule', (path, expected) => {
    expect(ruleKey(path)).toBe(expected)
  })
})
