import { TEST_PATTERNS } from '@pulls.review/core/analyze'
import picomatch from 'picomatch'

const isTest = picomatch(TEST_PATTERNS)

/** Tests, stories, fixtures and snapshots - marked in the diff view so they read apart from the code they cover. */
export function isTestFile(path: string): boolean {
  return isTest(path)
}
