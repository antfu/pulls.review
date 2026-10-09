import { describe, expect, it } from 'vitest'
import { isTestFile } from './test-files'

describe('isTestFile', () => {
  it('flags test files by name, anywhere in the tree', () => {
    expect(isTestFile('src/foo.test.ts')).toBe(true)
    expect(isTestFile('packages/app/src/foo.spec.tsx')).toBe(true)
    expect(isTestFile('pkg/server_test.go')).toBe(true)
    expect(isTestFile('app/test_views.py')).toBe(true)
  })

  it('flags test directories and what supports tests', () => {
    expect(isTestFile('tests/integration/run.ts')).toBe(true)
    expect(isTestFile('src/__tests__/foo.ts')).toBe(true)
    expect(isTestFile('src/Button.stories.ts')).toBe(true)
    expect(isTestFile('src/__snapshots__/foo.ts.snap')).toBe(true)
    expect(isTestFile('src/fixtures/pr.json')).toBe(true)
  })

  it('does not flag ordinary source files', () => {
    expect(isTestFile('src/index.ts')).toBe(false)
    expect(isTestFile('src/latest.ts')).toBe(false)
    expect(isTestFile('src/contest/index.ts')).toBe(false)
    expect(isTestFile('README.md')).toBe(false)
  })
})
