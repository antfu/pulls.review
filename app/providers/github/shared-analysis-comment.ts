import type { SharedAnalysis } from '../../types/shared-analysis'
import * as v from 'valibot'
import { SharedAnalysisSchema } from '../../types/shared-analysis'
import { githubRequest } from './review-api'

const GITHUB_API_BASE = 'https://api.github.com'
/** Never `location.origin`: the comment is public, a preview host must not leak into it. */
const SITE_ORIGIN = 'https://pulls.review'
const MARKER = '<!-- pulls.review data -->'
/** GitHub caps comment bodies at 65536 characters. */
const MAX_BODY_LENGTH = 60_000

export interface PullRequestRef { owner: string, repo: string, number: string }

export interface GithubIssueCommentJson {
  id: number
  user: { login: string } | null
  body: string
  html_url: string
  updated_at: string
}

export interface SharedAnalysisComment {
  id: number
  login: string
  url: string
  updatedAt: string
  analysis: SharedAnalysis
}

function formatUtcMinutes(iso: string): string {
  return iso.replace('T', ' ').slice(0, 16)
}

export function renderSharedAnalysisComment(pr: PullRequestRef, login: string, analysis: SharedAnalysis): string {
  const { result } = analysis
  const link = `${SITE_ORIGIN}/gh/${pr.owner}/${pr.repo}/${pr.number}?from=${login}`
  const summary = `analyzed by \`${result.model ?? result.source}\` at ${formatUtcMinutes(result.generatedAt)} UTC · head ${analysis.headSha.slice(0, 7)} · automated by pulls.review`
  const body = [
    MARKER,
    `👁️‍🗨️ Review this pull request with grouped, summarized diffs at:`,
    `👉 ${link}`,
    '',
    `<details><summary>raw result</summary>`,
    '',
    '<br>',
    summary,
    '',
    '```json',
    JSON.stringify(analysis, null, 2),
    '```',
    '',
    '</details>',
    '',
  ].join('\n')

  // TODO: if the body is too long, try using lz-string to compress it, and error when it still exceeds the limit.
  // The parser should support both uncompressed json and compressed lz-string.
  if (body.length > MAX_BODY_LENGTH)
    throw new Error(`The analysis is too large to share as a comment (${body.length} characters).`)
  return body
}

/** `undefined` for anything that isn't a well-formed pulls.review comment - never throws. */
export function parseSharedAnalysisComment(body: string): SharedAnalysis | undefined {
  if (!body.startsWith(MARKER))
    return undefined
  const match = body.match(/```json\n([\s\S]*?)\n```/)
  if (!match)
    return undefined
  try {
    const parsed = v.safeParse(SharedAnalysisSchema, JSON.parse(match[1]!))
    return parsed.success ? parsed.output : undefined
  }
  catch {
    return undefined
  }
}

/**
 * Shared analyses on the PR, newest first. First page only (100 comments) -
 * discovery is best-effort and must stay one request.
 */
export async function fetchSharedAnalysisComments(pr: PullRequestRef, token?: string): Promise<SharedAnalysisComment[]> {
  const res = await githubRequest('GET', `${GITHUB_API_BASE}/repos/${pr.owner}/${pr.repo}/issues/${pr.number}/comments?per_page=100`, token)
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

export async function createIssueComment(pr: PullRequestRef, body: string, token: string): Promise<{ id: number, url: string }> {
  const res = await githubRequest('POST', `${GITHUB_API_BASE}/repos/${pr.owner}/${pr.repo}/issues/${pr.number}/comments`, token, { body })
  const json: GithubIssueCommentJson = await res.json()
  return { id: json.id, url: json.html_url }
}

export async function updateIssueComment(pr: PullRequestRef, commentId: number, body: string, token: string): Promise<{ id: number, url: string }> {
  const res = await githubRequest('PATCH', `${GITHUB_API_BASE}/repos/${pr.owner}/${pr.repo}/issues/comments/${commentId}`, token, { body })
  const json: GithubIssueCommentJson = await res.json()
  return { id: json.id, url: json.html_url }
}
