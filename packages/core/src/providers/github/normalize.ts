import type { DiffHunk, DiffsPayload, FileChange, FileChangeStatus, PullRequestState } from '../../types/diff'
import type { GithubPullRequestCommitJson, GithubPullRequestFileJson, GithubPullRequestJson } from './api'
import { createTwoFilesPatch } from 'diff'
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

/** How to recover a patch GitHub left out of the files listing. */
export interface PatchFallbacks {
  /** Whole-PR `.diff` text; `undefined` when GitHub refuses to render it (too many files / too large). */
  loadDiffText: () => Promise<string | undefined>
  /** A file's content at a commit; `undefined` when the file doesn't exist there. */
  loadFileContent: (path: string, ref: string) => Promise<string | undefined>
}

/** Last resort for diffs too large for GitHub to render: diff the two file versions ourselves. */
async function diffFileContents(file: GithubPullRequestFileJson, pr: GithubPullRequestJson, loadFileContent: PatchFallbacks['loadFileContent']): Promise<DiffHunk[]> {
  const oldPath = file.previous_filename ?? file.filename
  const [oldContent, newContent] = await Promise.all([
    file.status === 'added' ? undefined : loadFileContent(oldPath, pr.base.sha),
    file.status === 'removed' ? undefined : loadFileContent(file.filename, pr.head.sha),
  ])
  return parseHunks(createTwoFilesPatch(oldPath, file.filename, oldContent ?? '', newContent ?? '').split('\n'))
}

async function normalizeFile(file: GithubPullRequestFileJson, pr: GithubPullRequestJson, fallbackDiffText: () => Promise<string | undefined>, loadFileContent: PatchFallbacks['loadFileContent']): Promise<FileChange> {
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
  const fullText = await fallbackDiffText()
  const parsed = fullText === undefined ? [] : await parsePatch(fullText)
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

  // Binary files report no changed lines; a text file with changes but no patch is just too large.
  if (fullText === undefined && file.additions + file.deletions > 0) {
    return {
      path: file.filename,
      previousPath: file.previous_filename,
      status,
      additions: file.additions,
      deletions: file.deletions,
      isBinary: false,
      sha: file.sha,
      hunks: await diffFileContents(file, pr, loadFileContent),
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
  { loadDiffText, loadFileContent }: PatchFallbacks,
): Promise<DiffsPayload> {
  let diffTextPromise: Promise<string | undefined> | undefined
  const fallbackDiffText = () => diffTextPromise ??= loadDiffText()

  const normalizedFiles = await Promise.all(
    files.map(file => normalizeFile(file, pr, fallbackDiffText, loadFileContent)),
  )

  return {
    ref: { kind: 'github-pr', owner, repo, number },
    title: pr.title,
    label: `#${number}`,
    author: pr.user ? { name: pr.user.login, avatarUrl: pr.user.avatar_url } : undefined,
    description: pr.body ?? '',
    url: pr.html_url,
    base: { sha: pr.base.sha, ref: pr.base.ref },
    head: { sha: pr.head.sha, ref: pr.head.ref },
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    pullRequest: {
      state: resolveState(pr),
    },
    commits: commits.map(({ sha, commit }) => ({ sha, message: commit.message })),
    files: normalizedFiles,
  }
}
