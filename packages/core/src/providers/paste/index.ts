import type { Provider } from '../../types/provider'
import { computeContentHash, parsePatch } from '../../patch-parser'

export const PasteProvider: Provider = {
  id: 'paste',
  capabilities: {
    supportsAuth: false,
    supportsComments: false,
    requiresNetwork: false,
    supportsFullFileContent: false,
  },
  async fetchDiff(params) {
    if (params.kind !== 'patch-text')
      throw new Error(`PasteProvider cannot handle params of kind "${params.kind}"`)

    const { text, title } = params
    const [files, contentHash] = await Promise.all([
      parsePatch(text),
      computeContentHash(text),
    ])

    return {
      provider: 'paste',
      id: `paste:${contentHash}`,
      title: title ?? 'Pasted diff',
      description: '',
      files,
    }
  },
}
