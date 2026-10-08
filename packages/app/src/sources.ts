import type { Credentials, DiffSource, RepositoryRef } from '@pulls.review/core/types'
import type { RoutableRef } from './source-routes'
import type { PullRequestListSource } from './stores/pull-request-list-store'
import { createGithubClient, createGithubSource, fetchOpenPullRequests } from '@pulls.review/core/github'
import { createGitlabClient, createGitlabMergeRequestSource, fetchOpenMergeRequests } from '@pulls.review/core/gitlab'
import { resolveStoredTokenMeta } from './composables/useGithubTokenMeta'
import { resolveStoredGitlabTokenMeta } from './composables/useGitlabTokenMeta'
import { repositoryName } from './source-routes'

/**
 * The only module that picks a host's provider for a ref. Pages build their stores
 * from what it returns, so nothing downstream asks which host it is talking to.
 */

/** The live source behind a routable ref, looking tokens up through this browser's meta cache. */
export function createSourceForRef(ref: RoutableRef, credentials: Credentials): DiffSource {
  return ref.kind === 'gitlab-mr'
    ? createGitlabMergeRequestSource(ref, credentials, { tokenMeta: (_host, token) => resolveStoredGitlabTokenMeta(token) })
    : createGithubSource(ref, credentials, { tokenMeta: resolveStoredTokenMeta })
}

/** A repository's open pull requests, with where its header links to on the host. */
export function createPullRequestListSource(repository: RepositoryRef, credentials: Credentials): PullRequestListSource {
  const { owner, name } = repositoryName(repository)
  if (repository.kind === 'github-repo') {
    const client = createGithubClient(credentials)
    return {
      repository,
      ownerUrl: `https://github.com/${owner}`,
      url: `https://github.com/${owner}/${name}/pulls`,
      auth: 'github-token',
      fetchPage: next => fetchOpenPullRequests(client, owner, name, next),
    }
  }
  const client = createGitlabClient(repository.host, credentials)
  return {
    repository,
    ownerUrl: `https://${repository.host}/${owner}`,
    url: `https://${repository.host}/${repository.project}/-/merge_requests`,
    auth: 'gitlab-token',
    fetchPage: next => fetchOpenMergeRequests(client, repository.project, next),
  }
}
