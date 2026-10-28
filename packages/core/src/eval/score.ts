import type { DiffGroup, GroupedResult } from '../types/analyze'

export interface GroupingScore {
  pairwisePrecision: number
  pairwiseRecall: number
  pairwiseF1: number
  /** Fraction of files in expected-critical groups that land in an actual-critical group. */
  criticalFileRecall: number
}

function flatten(groups: DiffGroup[]): DiffGroup[] {
  return groups.flatMap(group => [group, ...(group.children ?? [])])
}

function assignments(result: GroupedResult): Map<string, number> {
  const byFile = new Map<string, number>()
  flatten(result.groups).forEach((group, index) => {
    for (const path of group.filePaths)
      byFile.set(path, index)
  })
  return byFile
}

function criticalFiles(result: GroupedResult): Set<string> {
  const files = new Set<string>()
  for (const group of flatten(result.groups)) {
    if (group.critical)
      group.filePaths.forEach(path => files.add(path))
  }
  return files
}

/**
 * Pairwise grouping quality: over every pair of files present in both
 * results, precision asks "of pairs grouped together, how many belong
 * together" and recall the inverse. Group keys/labels are ignored, so
 * model and prompt variants compare on structure alone.
 */
export function scoreGrouping(expected: GroupedResult, actual: GroupedResult): GroupingScore {
  const expectedByFile = assignments(expected)
  const actualByFile = assignments(actual)
  const files = [...expectedByFile.keys()].filter(path => actualByFile.has(path))

  const { truePairs, actualPairs, expectedPairs } = countPairs(files, expectedByFile, actualByFile)

  const precision = actualPairs === 0 ? 1 : truePairs / actualPairs
  const recall = expectedPairs === 0 ? 1 : truePairs / expectedPairs
  const expectedCritical = criticalFiles(expected)
  const actualCritical = criticalFiles(actual)
  const criticalHits = [...expectedCritical].filter(path => actualCritical.has(path)).length

  return {
    pairwisePrecision: precision,
    pairwiseRecall: recall,
    pairwiseF1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
    criticalFileRecall: expectedCritical.size === 0 ? 1 : criticalHits / expectedCritical.size,
  }
}

function countPairs(files: string[], expectedByFile: Map<string, number>, actualByFile: Map<string, number>) {
  let truePairs = 0
  let actualPairs = 0
  let expectedPairs = 0
  for (let i = 0; i < files.length; i++) {
    for (let j = i + 1; j < files.length; j++) {
      const sameExpected = expectedByFile.get(files[i]!) === expectedByFile.get(files[j]!)
      const sameActual = actualByFile.get(files[i]!) === actualByFile.get(files[j]!)
      if (sameExpected)
        expectedPairs++
      if (sameActual)
        actualPairs++
      if (sameExpected && sameActual)
        truePairs++
    }
  }
  return { truePairs, actualPairs, expectedPairs }
}
