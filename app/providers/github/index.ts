import type { Provider } from '../../types/provider'
import { fetchFileContentAtRef, fetchPullRequest, fetchPullRequestCommits, fetchPullRequestDiffText, fetchPullRequestFiles } from './api'
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
    const [pr, files, commits] = await Promise.all([
      fetchPullRequest(owner, repo, number, opts.token),
      fetchPullRequestFiles(owner, repo, number, opts.token),
      fetchPullRequestCommits(owner, repo, number, opts.token),
    ])

    return normalizePullRequest(owner, repo, number, pr, files, commits, {
      loadDiffText: () => fetchPullRequestDiffText(owner, repo, number, opts.token),
      loadFileContent: (path, ref) => fetchFileContentAtRef(owner, repo, path, ref, opts.token),
    })
  },
}
