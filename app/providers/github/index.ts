import type { Provider } from '../../types/provider'
import { fetchPullRequest, fetchPullRequestDiffText, fetchPullRequestFiles } from './api'
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
    const [pr, files] = await Promise.all([
      fetchPullRequest(owner, repo, number, opts.token),
      fetchPullRequestFiles(owner, repo, number, opts.token),
    ])

    return normalizePullRequest(owner, repo, number, pr, files, () => fetchPullRequestDiffText(owner, repo, number, opts.token))
  },
}
