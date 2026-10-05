import type { LlmSettings } from '@pulls.review/core/analyze'
import type { PullRequestRef } from '@pulls.review/core/github'
import type { runLlmAnalysis } from '@pulls.review/core/llm'
import type { Locale } from '@pulls.review/core/locales'
import type { AnalyzeProgress } from '@pulls.review/core/types'
import { resolveModel } from '@pulls.review/core/analyze'
import { diagnostics } from '@pulls.review/core/diagnostics'
import { createGithubPullRequestSource } from '@pulls.review/core/github'
import { staticCredentials } from '@pulls.review/core/types'

/** The author GitHub shows for a workflow's `GITHUB_TOKEN`, which cannot look itself up at `/user`. */
const ACTIONS_BOT_LOGIN = 'github-actions[bot]'

export interface RunOptions {
  pr: PullRequestRef
  githubToken: string
  llm: LlmSettings
  locale: Locale
  log: (line: string) => void
}

export type RunOutcome
  = | { status: 'up-to-date', url: string }
    | { status: 'posted', url: string }

function describeProgress(progress: AnalyzeProgress): string {
  switch (progress.kind) {
    case 'thinking':
      return `[${progress.step}] thinking`
    case 'reading':
      return `[${progress.step}] reading ${progress.paths.length} file${progress.paths.length === 1 ? '' : 's'}`
    case 'organizing':
      return `[${progress.step}] organizing groups`
  }
}

/**
 * Fetches the PR, analyzes it and upserts the shared-analysis comment, exactly like the
 * site's "share as comment" - one comment per author, found by its marker. A comment
 * already carrying the PR's current head sha is left alone, so re-runs on an unchanged
 * PR cost no model call.
 */
export async function run({ pr, githubToken, llm, locale, log }: RunOptions, analyze: typeof runLlmAnalysis): Promise<RunOutcome> {
  const resolved = resolveModel(llm)
  if (!resolved)
    throw diagnostics.llmNotConfigured()

  const source = createGithubPullRequestSource(pr, staticCredentials(githubToken))
  const [diff, login, comments] = await Promise.all([
    source.fetch(),
    source.viewer().then(viewer => viewer?.login ?? ACTIONS_BOT_LOGIN, () => ACTIONS_BOT_LOGIN),
    source.sharing.list(),
  ])
  const headSha = diff.head?.sha ?? ''
  const existing = comments.find(comment => comment.login === login)
  if (existing && existing.analysis.headSha === headSha)
    return { status: 'up-to-date', url: existing.url }

  log(`Analyzing ${pr.owner}/${pr.repo}#${pr.number} (${diff.files.length} files) with ${resolved.model.provider}/${resolved.model.id}`)
  const { result } = await analyze(diff, resolved, locale, { onProgress: progress => log(describeProgress(progress)) })
  const comment = await source.sharing.upsert(login, { headSha, result }, existing)
  return { status: 'posted', url: comment.url }
}
