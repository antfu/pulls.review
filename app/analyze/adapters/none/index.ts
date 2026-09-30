import type { AnalyzeAdapter, GroupedResultCore } from '../../../types/analyze'
import { t } from '../../../i18n'
import { normalizeGroupedResult } from '../../../types/analyze'

export const NONE_SCHEMA_VERSION = 1

export const noneAdapter: AnalyzeAdapter = {
  id: 'none',
  available: true,
  async analyze(diff) {
    const core: GroupedResultCore = {
      groups: [{ key: 'all', label: t('rules.allFiles'), filePaths: diff.files.map(file => file.path) }],
      schemaVersion: NONE_SCHEMA_VERSION,
    }
    return normalizeGroupedResult('none', core)
  },
}
