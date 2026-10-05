import type { SharingApi } from '../../types/source'
import type { GithubClient } from './client'
import type { PullRequestRef } from './shared-analysis-comment'
import { GithubApiError } from './client'
import { createIssueComment, fetchSharedAnalysisComments, renderSharedAnalysisComment, updateIssueComment } from './shared-analysis-comment'
import { asWrite } from './writes'

export function createGithubSharingApi(client: GithubClient, pr: PullRequestRef): SharingApi {
  return {
    list: () => fetchSharedAnalysisComments(client, pr),
    upsert: (login, analysis, remembered) => asWrite(async () => {
      const body = renderSharedAnalysisComment(pr, login, analysis)
      if (remembered) {
        try {
          return await updateIssueComment(client, pr, remembered.id, body)
        }
        catch (err) {
          // The remembered comment was deleted on GitHub - fall through to the scan.
          if (!(err instanceof GithubApiError && err.status === 404))
            throw err
        }
      }
      const existing = (await fetchSharedAnalysisComments(client, pr)).find(entry => entry.login === login)
      return existing
        ? updateIssueComment(client, pr, existing.id, body)
        : createIssueComment(client, pr, body)
    }),
  }
}
