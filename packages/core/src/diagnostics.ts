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
      why: 'GitHub rejected the token.',
      fix: 'Check that the token is valid and has not expired.',
    },
    writeForbidden: {
      /** The source's own reason, e.g. GitHub's "Resource not accessible by personal access token". */
      why: (p: { reason: string }) => p.reason,
      fix: 'Use a token with the "repo" scope (classic token) or "Pull requests: Read and write" permission (fine-grained token).',
    },
    commentTooLarge: {
      why: (p: { n: number }) => `The analysis is too large to post as a comment (${p.n} characters).`,
      data: (p: { n: number }) => ({ n: p.n }),
    },
  },
})
