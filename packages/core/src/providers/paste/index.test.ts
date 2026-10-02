import { describe, expect, it } from 'vitest'
import { createPasteSource } from './index'

const PATCH_TEXT = `diff --git a/README.md b/README.md
index e69de29..4b825dc 100644
--- a/README.md
+++ b/README.md
@@ -0,0 +1,1 @@
+hello
`

describe('paste source', () => {
  it('parses raw patch text into a DiffsPayload keyed by content hash', async () => {
    const source = createPasteSource(PATCH_TEXT)
    const diff = await source.fetch()
    expect(diff.ref).toEqual({ kind: 'paste', hash: expect.stringMatching(/^[0-9a-f]{64}$/) })
    expect(await source.key()).toBe(`paste:${diff.ref.kind === 'paste' && diff.ref.hash}`)
    expect(diff.title).toBe('Pasted diff')
    expect(diff.files).toHaveLength(1)
    expect(diff.files[0]!.path).toBe('README.md')
  })

  it('uses a supplied title when given', async () => {
    expect((await createPasteSource(PATCH_TEXT, 'My diff').fetch()).title).toBe('My diff')
  })

  it('produces the same key for identical text (dedupes cache key)', async () => {
    expect(await createPasteSource(PATCH_TEXT).key()).toBe(await createPasteSource(PATCH_TEXT).key())
  })

  it('has no staleness check', () => {
    expect(createPasteSource(PATCH_TEXT).fingerprint).toBeUndefined()
  })
})
