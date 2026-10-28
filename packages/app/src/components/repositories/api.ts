import type { LlmSettings } from '@pulls.review/core/analyze'
import type { RemoteAnalysisJob } from '../../analyze/remote-analyze'
import { $fetch } from 'ofetch'

export interface HostConfig {
  oauth: boolean
  installations: boolean
  githubAppSlug: string | null
  webhook: boolean
}

export interface Installation {
  id: number
  account: string
  avatarUrl: string
  suspended: boolean
  manageUrl: string
}

export interface Repository {
  id: number
  owner: string
  name: string
  description: string | null
  private: boolean
  archived: boolean
  admin: boolean
}

export interface ScanConfig {
  enabled: boolean
  includeDrafts: boolean
  publishCheckRun: boolean
  monthlyBudgetRuns: number | null
  excludePaths: string[]
  locale: string
  llm: Omit<LlmSettings, 'gatewayToken' | 'anthropicApiKey' | 'openaiApiKey'> & {
    hasGatewayToken: boolean
    hasAnthropicKey: boolean
    hasOpenaiKey: boolean
  }
}

export interface ScanSettings {
  config: ScanConfig | null
  inherited: ScanConfig | null
}

export interface ScanRuns {
  jobs: RemoteAnalysisJob[]
  usage: { runs: number, budget: number | null, month: string }
}

export const api = $fetch.create({ credentials: 'same-origin', retry: 0 })

export function scanPath(owner: string, repo: string) {
  return `/api/automation/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
}

/** GitHub owns pagination; don't silently omit installations or repositories. */
export async function connectionPages<T>(path: string, key: 'installations' | 'repositories', signal: AbortSignal): Promise<T[]> {
  const items: T[] = []
  let page: number | null = 1
  while (page !== null) {
    const response: { installations?: T[], repositories?: T[], nextPage: number | null } = await api(path, { query: { page }, signal })
    items.push(...response[key] ?? [])
    page = response.nextPage
  }
  return items
}
