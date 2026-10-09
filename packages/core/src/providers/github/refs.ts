import type { DiffsPayload } from '../../types/diff'
import type { Credentials, DiffSource } from '../../types/source'
import type { GithubDiffEntryJson } from './api'
import type { GithubClient } from './client'
import { serializeRef } from '../../types/source'
import { fetchCommit, fetchCompare, fetchDiffText, fetchFileContentAtRef, fetchRefSha, toCommit } from './api'
import { createGithubClient } from './client'
import { normalizeFiles } from './normalize'

/** Entries without a blob sha (submodules) still need a stable per-version key for reviewed marks. */
function withSha(files: GithubDiffEntryJson[] | undefined, headSha: string) {
  return (files ?? []).map(file => ({ ...file, sha: file.sha ?? `${headSha}:${file.filename}` }))
}

function fallbacks(client: GithubClient, owner: string, repo: string, diffPath: string) {
  return {
    loadDiffText: () => fetchDiffText(client, diffPath),
    loadFileContent: (path: string, sha: string) => fetchFileContentAtRef(client, owner, repo, path, sha),
  }
}

/** What `head` adds since it forked from `base`, the diff GitHub shows at `/compare/base...head`. */
export function createGithubCompareSource({ owner, repo, base, head }: { owner: string, repo: string, base: string, head: string }, credentials?: Credentials): DiffSource {
  const client = createGithubClient(credentials)
  const key = serializeRef({ kind: 'github-compare', owner, repo, base, head })
  return {
    key: async () => key,
    async fetch(): Promise<DiffsPayload> {
      const compare = await fetchCompare(client, owner, repo, base, head)
      const baseSha = compare.merge_base_commit.sha
      const headSha = compare.commits.at(-1)?.sha ?? baseSha
      const diffPath = `/repos/${owner}/${repo}/compare/${baseSha}...${headSha}`
      return {
        ref: { kind: 'github-compare', owner, repo, base, head },
        title: `${base}...${head}`,
        url: compare.html_url,
        base: { sha: baseSha, ref: base },
        head: { sha: headSha, ref: head },
        commits: compare.commits.map(toCommit),
        files: await normalizeFiles(withSha(compare.files, headSha), { base: baseSha, head: headSha }, fallbacks(client, owner, repo, diffPath)),
      }
    },
    fingerprint: () => fetchRefSha(client, owner, repo, head),
    loadFile: (path, sha) => fetchFileContentAtRef(client, owner, repo, path, sha),
    auth: 'github-token',
  }
}

/** One commit against its first parent. A commit never changes, so it has no staleness check. */
export function createGithubCommitSource({ owner, repo, sha }: { owner: string, repo: string, sha: string }, credentials?: Credentials): DiffSource {
  const client = createGithubClient(credentials)
  const key = serializeRef({ kind: 'github-commit', owner, repo, sha })
  return {
    key: async () => key,
    async fetch(): Promise<DiffsPayload> {
      const commit = await fetchCommit(client, owner, repo, sha)
      const [subject = '', ...body] = commit.commit.message.split('\n')
      const parent = commit.parents[0]?.sha
      const { author, date } = toCommit(commit)
      return {
        ref: { kind: 'github-commit', owner, repo, sha },
        title: subject,
        label: commit.sha.slice(0, 7),
        description: body.join('\n').trim(),
        url: commit.html_url,
        author,
        createdAt: date,
        base: parent ? { sha: parent, ref: parent.slice(0, 7) } : undefined,
        head: { sha: commit.sha, ref: commit.sha.slice(0, 7) },
        commits: [toCommit(commit)],
        files: await normalizeFiles(withSha(commit.files, commit.sha), { base: parent, head: commit.sha }, fallbacks(client, owner, repo, `/repos/${owner}/${repo}/commits/${commit.sha}`)),
      }
    },
    loadFile: (path, fileSha) => fetchFileContentAtRef(client, owner, repo, path, fileSha),
    auth: 'github-token',
  }
}
