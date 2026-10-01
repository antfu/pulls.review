import { describe, expect, it } from 'vitest'
import { PasteProvider } from './index'

const PATCH_TEXT = `diff --git a/README.md b/README.md
index e69de29..4b825dc 100644
--- a/README.md
+++ b/README.md
@@ -0,0 +1,1 @@
+hello
`

describe('pasteProvider', () => {
  it('parses raw patch text into a DiffsPayload keyed by content hash', async () => {
    const diff = await PasteProvider.fetchDiff({ kind: 'patch-text', text: PATCH_TEXT }, {})
    expect(diff.provider).toBe('paste')
    expect(diff.id).toMatch(/^paste:[0-9a-f]{64}$/)
    expect(diff.title).toBe('Pasted diff')
    expect(diff.files).toHaveLength(1)
    expect(diff.files[0]!.path).toBe('README.md')
  })

  it('uses a supplied title when given', async () => {
    const diff = await PasteProvider.fetchDiff({ kind: 'patch-text', text: PATCH_TEXT, title: 'My diff' }, {})
    expect(diff.title).toBe('My diff')
  })

  it('produces the same content hash for identical text (dedupes cache key)', async () => {
    const a = await PasteProvider.fetchDiff({ kind: 'patch-text', text: PATCH_TEXT }, {})
    const b = await PasteProvider.fetchDiff({ kind: 'patch-text', text: PATCH_TEXT }, {})
    expect(a.id).toBe(b.id)
  })

  it('rejects params of the wrong kind', async () => {
    await expect(PasteProvider.fetchDiff({ kind: 'github-pr', owner: 'a', repo: 'b', number: '1' } as any, {})).rejects.toThrow()
  })
})
