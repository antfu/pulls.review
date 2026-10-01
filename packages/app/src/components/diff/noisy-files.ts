import { GENERATED_PATTERNS } from '@pulls.review/core'
import picomatch from 'picomatch'

const isGenerated = picomatch(GENERATED_PATTERNS)

/** Generated/lockfile-style files that are noisy to review by default - collapsed on first render. */
export function isNoisyFile(path: string): boolean {
  return isGenerated(path)
}
