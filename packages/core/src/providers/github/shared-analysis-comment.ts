import type { SharedAnalysis, SharedAnalysisComment } from '../../types/shared-analysis'
import type { GithubClient } from './client'
import { parseSharedAnalysisBody, renderSharedAnalysisBody, SITE_ORIGIN } from '../shared-analysis-body'

/** GitHub caps comment bodies at 65536 characters. */
const MAX_BODY_LENGTH = 60_000

/** The author GitHub shows for a workflow's `GITHUB_TOKEN` - the CLI's comments in CI. */
export const ACTIONS_BOT_LOGIN = 'github-actions[bot]'

export interface PullRequestRef { owner: string, repo: string, number: string }

export interface GithubIssueCommentJson {
  id: number
  user: { login: string } | null
  body: string
  html_url: string
  updated_at: string
}

export function renderSharedAnalysisComment(pr: PullRequestRef, login: string, analysis: SharedAnalysis): string {
  return renderSharedAnalysisBody(analysis, {
    link: `${SITE_ORIGIN}/gh/${pr.owner}/${pr.repo}/${pr.number}?from=${login}`,
    subject: 'pull request',
    maxLength: MAX_BODY_LENGTH,
  })
}

export const parseSharedAnalysisComment = parseSharedAnalysisBody

/**
 * Shared analyses on the PR, newest first. First page only (100 comments) -
 * discovery is best-effort and must stay one request.
 */
export async function fetchSharedAnalysisComments(client: GithubClient, pr: PullRequestRef): Promise<SharedAnalysisComment[]> {
  const res = await client.request(`/repos/${pr.owner}/${pr.repo}/issues/${pr.number}/comments?per_page=100`)
  const comments: GithubIssueCommentJson[] = await res.json()
  return comments
    .flatMap((comment) => {
      const analysis = parseSharedAnalysisComment(comment.body)
      return analysis && comment.user
        ? [{ id: comment.id, login: comment.user.login, url: comment.html_url, updatedAt: comment.updated_at, analysis }]
        : []
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function createIssueComment(client: GithubClient, pr: PullRequestRef, body: string): Promise<{ id: number, url: string }> {
  const res = await client.request(`/repos/${pr.owner}/${pr.repo}/issues/${pr.number}/comments`, { method: 'POST', body: { body } })
  const json: GithubIssueCommentJson = await res.json()
  return { id: json.id, url: json.html_url }
}

export async function updateIssueComment(client: GithubClient, pr: PullRequestRef, commentId: number, body: string): Promise<{ id: number, url: string }> {
  const res = await client.request(`/repos/${pr.owner}/${pr.repo}/issues/comments/${commentId}`, { method: 'PATCH', body: { body } })
  const json: GithubIssueCommentJson = await res.json()
  return { id: json.id, url: json.html_url }
}
