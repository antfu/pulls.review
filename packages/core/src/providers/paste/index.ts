import type { DiffSource } from '../../types/source'
import { computeContentHash, parsePatch } from '../../patch-parser'
import { serializeRef } from '../../types/source'

/** A pasted or uploaded patch: no live source, so no staleness check. */
export function createPasteSource(text: string, title?: string): DiffSource {
  const hash = computeContentHash(text)
  return {
    key: async () => serializeRef({ kind: 'paste', hash: await hash }),
    async fetch() {
      return {
        ref: { kind: 'paste', hash: await hash },
        title: title ?? 'Pasted diff',
        description: '',
        files: await parsePatch(text),
      }
    },
  }
}
