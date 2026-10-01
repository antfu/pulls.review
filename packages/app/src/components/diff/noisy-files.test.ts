import { describe, expect, it } from 'vitest'
import { isNoisyFile } from './noisy-files'

describe('isNoisyFile', () => {
  it('flags known lockfiles, anywhere in the tree', () => {
    expect(isNoisyFile('pnpm-lock.yaml')).toBe(true)
    expect(isNoisyFile('packages/app/pnpm-lock.yaml')).toBe(true)
    expect(isNoisyFile('yarn.lock')).toBe(true)
    // Any `*.lock` file, not just the ones with a dedicated pattern.
    expect(isNoisyFile('Cargo.lock')).toBe(true)
  })

  it('flags generated output and dist files', () => {
    expect(isNoisyFile('src/schema.generated.ts')).toBe(true)
    expect(isNoisyFile('dist/index.js')).toBe(true)
  })

  it('does not flag ordinary source files', () => {
    expect(isNoisyFile('src/index.ts')).toBe(false)
    expect(isNoisyFile('README.md')).toBe(false)
  })
})
