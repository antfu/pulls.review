import type { AnalyzeAdapter, GroupSource } from '@pulls.review/core/types'
import { resolveAdapter } from '../analyze'

export function useAnalyzeAdapter(id: GroupSource): AnalyzeAdapter {
  return resolveAdapter(id)
}
