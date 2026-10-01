import type { AnalyzeProgress, LlmSettings, Locale, PullRequestRef } from '@pulls.review/core'
import type { runLlmAnalysis } from '@pulls.review/core/llm'
import { createIssueComment, diagnostics, fetchGithubTokenMeta, fetchSharedAnalysisComments, GithubProvider, renderSharedAnalysisComment, resolveModel, updateIssueComment } from '@pulls.review/core'

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

  const [diff, login, comments] = await Promise.all([
    GithubProvider.fetchDiff({ kind: 'github-pr', ...pr }, { token: githubToken }),
    fetchGithubTokenMeta(githubToken).then(meta => meta.login, () => ACTIONS_BOT_LOGIN),
    fetchSharedAnalysisComments(pr, githubToken),
  ])
  const headSha = diff.head?.sha ?? ''
  const existing = comments.find(comment => comment.login === login)
  if (existing && existing.analysis.headSha === headSha)
    return { status: 'up-to-date', url: existing.url }

  log(`Analyzing ${pr.owner}/${pr.repo}#${pr.number} (${diff.files.length} files) with ${resolved.model.provider}/${resolved.model.id}`)
  const { result } = await analyze(diff, resolved, locale, { onProgress: progress => log(describeProgress(progress)) })
  const body = renderSharedAnalysisComment(pr, login, { headSha, result })
  const comment = existing
    ? await updateIssueComment(pr, existing.id, body, githubToken)
    : await createIssueComment(pr, body, githubToken)
  return { status: 'posted', url: comment.url }
}
