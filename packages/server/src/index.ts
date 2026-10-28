import type { Env } from './env'
import { handleAnalysisFeedback } from './analysis-feedback'
import { handleAnalysisJobStatus } from './analysis-jobs'
import { handleAnalysisResults, handleAnalysisStatusBatch } from './analysis-results'
import { handleAutomationConfig } from './automation-config'
import { handleGithubRoutes } from './github-routes'
import { handleUserConfig } from './user-config'
import { handleWebhook } from './webhook'

// The webhook must be dispatched before the general GitHub proxy.
const handlers = [
  handleUserConfig,
  handleAnalysisResults,
  handleAnalysisStatusBatch,
  handleAnalysisJobStatus,
  handleAutomationConfig,
  handleAnalysisFeedback,
  handleWebhook,
  handleGithubRoutes,
]

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  for (const handle of handlers) {
    const response = await handle(request, env)
    if (response)
      return response
  }
  return new Response('Not found', { status: 404 })
}
