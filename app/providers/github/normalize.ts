import type { DiffsPayload, FileChange, FileChangeStatus, PullRequestState } from '../../types/diff'
import type { GithubPullRequestCommitJson, GithubPullRequestFileJson, GithubPullRequestJson } from './api'
import { parseHunks, parsePatch } from '../../patch-parser'

const STATUS_MAP: Record<string, FileChangeStatus> = {
  added: 'added',
  removed: 'removed',
  modified: 'modified',
  renamed: 'renamed',
  copied: 'copied',
  changed: 'modified',
  unchanged: 'modified',
}

async function normalizeFile(file: GithubPullRequestFileJson, fallbackDiffText?: () => Promise<string>): Promise<FileChange> {
  const status = STATUS_MAP[file.status] ?? 'modified'

  if (file.patch !== undefined) {
    const lines = file.patch.split('\n')
    const hunks = parseHunks(lines)
    const { additions, deletions } = { additions: file.additions, deletions: file.deletions }
    return {
      path: file.filename,
      previousPath: file.previous_filename,
      status,
      additions,
      deletions,
      isBinary: false,
      sha: file.sha,
      hunks,
    }
  }

  // GitHub omits `patch` for very large diffs (and gives no direct signal for binary
  // files), fall back to the raw `.diff` text, which is authoritative for both.
  if (fallbackDiffText) {
    const fullText = await fallbackDiffText()
    const parsed = await parsePatch(fullText)
    const match = parsed.find(f => f.path === file.filename || (!!file.previous_filename && f.previousPath === file.previous_filename))
    if (match) {
      // The JSON API stays the source of truth for blob sha/status/counts whenever it has them.
      return {
        ...match,
        status,
        previousPath: file.previous_filename,
        sha: file.sha,
        additions: file.additions,
        deletions: file.deletions,
      }
    }
  }

  return {
    path: file.filename,
    previousPath: file.previous_filename,
    status,
    additions: file.additions,
    deletions: file.deletions,
    isBinary: true,
    sha: file.sha,
    hunks: [],
  }
}

function resolveState(pr: GithubPullRequestJson): PullRequestState {
  if (pr.merged)
    return 'merged'
  if (pr.state === 'closed')
    return 'closed'
  if (pr.draft)
    return 'draft'
  return 'open'
}

export async function normalizePullRequest(
  owner: string,
  repo: string,
  number: string,
  pr: GithubPullRequestJson,
  files: GithubPullRequestFileJson[],
  commits: GithubPullRequestCommitJson[],
  loadFallbackDiffText: () => Promise<string>,
): Promise<DiffsPayload> {
  let fallbackDiffTextPromise: Promise<string> | undefined
  const fallbackDiffText = () => fallbackDiffTextPromise ??= loadFallbackDiffText()

  const normalizedFiles = await Promise.all(
    files.map(file => normalizeFile(file, fallbackDiffText)),
  )

  return {
    provider: 'github',
    id: `github:${owner}/${repo}#${number}`,
    title: pr.title,
    description: pr.body ?? '',
    url: pr.html_url,
    base: { sha: pr.base.sha, ref: pr.base.ref },
    head: { sha: pr.head.sha, ref: pr.head.ref },
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    pullRequest: {
      author: pr.user?.login,
      state: resolveState(pr),
    },
    commits: commits.map(({ sha, commit }) => ({ sha, message: commit.message })),
    files: normalizedFiles,
  }
}
