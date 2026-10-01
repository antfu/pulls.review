import type { Provider } from '@pulls.review/core/types'
import { GithubProvider } from '@pulls.review/core/github'
import { PasteProvider } from '@pulls.review/core/paste'

const providers: Record<'github' | 'paste', Provider> = {
  github: GithubProvider,
  paste: PasteProvider,
}

export function useProvider(id: 'github' | 'paste'): Provider {
  return providers[id]
}
