import { defineDiagnostics } from 'nostics'

/**
 * Everything core reports to a person. Codes are stable so a UI can translate by
 * code (`diagnostic.name`); the English `why`/`fix` is what a terminal shows.
 */
export const diagnostics = defineDiagnostics({
  codes: {
    llmNotConfigured: {
      why: 'No LLM provider is configured.',
      fix: 'Set an API key or gateway token for the selected provider.',
    },
    agentSessionLost: {
      why: 'The agent no longer has this conversation.',
      fix: 'Re-analyze to chat.',
    },
    tokenRejected: {
      why: (p: { provider: string }) => `${p.provider} rejected the token.`,
      fix: 'Check that the token is valid and has not expired.',
      data: (p: { provider: string }) => ({ provider: p.provider }),
    },
    writeForbidden: {
      /** The source's own reason, e.g. GitHub's "Resource not accessible by personal access token". */
      why: (p: { reason: string, needs: string }) => p.reason,
      /** `needs` names what a token must have to write, in the source's own terms. */
      fix: (p: { reason: string, needs: string }) => `Use a token with ${p.needs}.`,
      data: (p: { reason: string, needs: string }) => ({ needs: p.needs }),
    },
    diffOutdated: {
      why: 'The merge request has new commits since this diff was loaded.',
      fix: 'Refresh the diff, then comment again.',
    },
    lineNotInDiff: {
      why: (p: { path: string, line: number }) => `Line ${p.line} of ${p.path} is not part of this diff.`,
    },
    approvalRefused: {
      why: 'GitLab did not accept the approval.',
      fix: 'You may be the author, have approved already, or not be an eligible approver.',
    },
    commentTooLarge: {
      why: (p: { n: number }) => `The analysis is too large to post as a comment (${p.n} characters).`,
      data: (p: { n: number }) => ({ n: p.n }),
    },
  },
})
