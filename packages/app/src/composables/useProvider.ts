import type { Provider } from '@pulls.review/core'
import { GithubProvider, PasteProvider } from '@pulls.review/core'

const providers: Record<'github' | 'paste', Provider> = {
  github: GithubProvider,
  paste: PasteProvider,
}

export function useProvider(id: 'github' | 'paste'): Provider {
  return providers[id]
}
