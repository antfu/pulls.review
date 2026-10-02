import type { Provider } from '../../types/provider'
import { fetchFileContentAtRef, fetchPullRequest, fetchPullRequestCommits, fetchPullRequestDiffText, fetchPullRequestFiles } from './api'
import { createGithubClient } from './client'
import { normalizePullRequest } from './normalize'

export const GithubProvider: Provider = {
  id: 'github',
  capabilities: {
    supportsAuth: true,
    supportsComments: true,
    requiresNetwork: true,
    supportsFullFileContent: true,
  },
  async fetchDiff(params, opts) {
    if (params.kind !== 'github-pr')
      throw new Error(`GithubProvider cannot handle params of kind "${params.kind}"`)

    const { owner, repo, number } = params
    const client = createGithubClient(opts.token)
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
}
