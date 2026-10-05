import type { Credentials, DiffSource } from '../../types/source'
import { serializeRef } from '../../types/source'
import { fetchFileContentAtRef, fetchPullRequest, fetchPullRequestCommits, fetchPullRequestDiffText, fetchPullRequestFiles } from './api'
import { createGithubClient } from './client'
import { normalizePullRequest } from './normalize'

export function createGithubPullRequestSource({ owner, repo, number }: { owner: string, repo: string, number: string }, credentials?: Credentials): DiffSource {
  const client = createGithubClient(credentials)
  const key = serializeRef({ kind: 'github-pr', owner, repo, number })
  return {
    key: async () => key,
    async fetch() {
      const [pr, files, commits] = await Promise.all([
        fetchPullRequest(client, owner, repo, number),
        fetchPullRequestFiles(client, owner, repo, number),
        fetchPullRequestCommits(client, owner, repo, number),
      ])
      return normalizePullRequest(owner, repo, number, pr, files, commits, {
        loadDiffText: () => fetchPullRequestDiffText(client, owner, repo, number),
        loadFileContent: (path, ref) => fetchFileContentAtRef(client, owner, repo, path, ref),
      })
    },
    fingerprint: async () => (await fetchPullRequest(client, owner, repo, number)).head.sha,
    loadFile: (path, sha) => fetchFileContentAtRef(client, owner, repo, path, sha),
    githubPullRequest: { owner, repo, number },
    auth: 'github-token',
  }
}
