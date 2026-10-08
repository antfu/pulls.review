import type { SharedAnalysis, SharedAnalysisComment } from '../../types/shared-analysis'
import type { SharingApi } from '../../types/source'
import type { MergeRequestRef } from './api'
import type { GitlabClient } from './client'
import { parseSharedAnalysisBody, renderSharedAnalysisBody, SITE_ORIGIN } from '../shared-analysis-body'
import { mergeRequestUrl } from './api'
import { GitlabApiError } from './client'
import { createNote, fetchRecentNotes, updateNote } from './review-api'
import { GITLAB_COM } from './url'
import { asWrite } from './writes'

/** GitLab caps a note at 1,000,000 characters. */
const MAX_NOTE_LENGTH = 1_000_000

/**
 * The site path that reopens a merge request. gitlab.com projects sit directly
 * under `/gl/`; another instance is named by an `@host` segment, which no
 * namespace can be (a GitLab path never starts with `@`).
 */
export function gitlabSitePath(host: string, { project, iid }: MergeRequestRef): string {
  return `/gl/${host === GITLAB_COM ? '' : `@${host}/`}${project}/-/merge_requests/${iid}`
}

export function renderSharedAnalysisNote(host: string, mr: MergeRequestRef, login: string, analysis: SharedAnalysis): string {
  return renderSharedAnalysisBody(analysis, {
    link: `${SITE_ORIGIN}${gitlabSitePath(host, mr)}?from=${login}`,
    subject: 'merge request',
    maxLength: MAX_NOTE_LENGTH,
  })
}

/**
 * Shared analyses among the merge request's 100 most recently updated notes, newest
 * first - discovery is best-effort and must stay one request. Needs a token.
 */
export async function fetchSharedAnalysisNotes(client: GitlabClient, mr: MergeRequestRef): Promise<SharedAnalysisComment[]> {
  const url = mergeRequestUrl(client.host, mr)
  return (await fetchRecentNotes(client, mr)).flatMap((note) => {
    const analysis = parseSharedAnalysisBody(note.body)
    return analysis && note.author
      ? [{ id: note.id, login: note.author.username, url: `${url}#note_${note.id}`, updatedAt: note.updated_at, analysis }]
      : []
  })
}

export function createGitlabSharingApi(client: GitlabClient, mr: MergeRequestRef): SharingApi {
  const saved = (note: { id: number }) => ({ id: note.id, url: `${mergeRequestUrl(client.host, mr)}#note_${note.id}` })
  return {
    list: () => fetchSharedAnalysisNotes(client, mr),
    upsert: (login, analysis, remembered) => asWrite(async () => {
      const body = renderSharedAnalysisNote(client.host, mr, login, analysis)
      if (remembered) {
        try {
          return saved(await updateNote(client, mr, remembered.id, body))
        }
        catch (err) {
          // The remembered note was deleted on GitLab - fall through to the scan.
          if (!(err instanceof GitlabApiError && err.status === 404))
            throw err
        }
      }
      const existing = (await fetchSharedAnalysisNotes(client, mr)).find(entry => entry.login === login)
      return saved(existing
        ? await updateNote(client, mr, existing.id, body)
        : await createNote(client, mr, body))
    }),
  }
}
