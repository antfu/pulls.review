import type { DiffSource } from '@pulls.review/core/types'

/** The host a credential belongs to, as messages name it. A source that takes no credential reads as GitHub's, as it always has. */
export function hostName(auth: DiffSource['auth']): string {
  return auth === 'gitlab-token' ? 'GitLab' : 'GitHub'
}
