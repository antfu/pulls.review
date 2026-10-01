import type { AnalyzeAdapter, GroupedResultCore } from '../../../types/analyze'
import { normalizeGroupedResult } from '../../../types/analyze'

export const NONE_SCHEMA_VERSION = 1

/** `label` names the single group holding every file; resolved per run so it follows the current language. */
export function createNoneAdapter(label: () => string): AnalyzeAdapter {
  return {
    id: 'none',
    available: true,
    async analyze(diff) {
      const core: GroupedResultCore = {
        groups: [{ key: 'all', label: label(), filePaths: diff.files.map(file => file.path) }],
        schemaVersion: NONE_SCHEMA_VERSION,
      }
      return normalizeGroupedResult('none', core)
    },
  }
}
