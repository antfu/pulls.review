import { describe, expect, it } from 'vitest'
import { parsePatch } from './patch-parser'

const GIT_DIFF_FIXTURE = `diff --git a/src/foo.ts b/src/foo.ts
index e69de29..4b825dc 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 export function foo() {
-  return 1
+  return 2
 }
+// trailing comment
diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,2 @@
+export const x = 1
+export const y = 2
diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index 89abcde..0000000
--- a/src/old.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-export const gone = true
-// bye
diff --git a/src/renamed-from.ts b/src/renamed-to.ts
similarity index 100%
rename from src/renamed-from.ts
rename to src/renamed-to.ts
diff --git a/assets/logo.png b/assets/logo.png
index aaaaaaa..bbbbbbb 100644
Binary files a/assets/logo.png and b/assets/logo.png differ
`

const POSIX_DIFF_FIXTURE = `--- old.txt
+++ new.txt
@@ -1,2 +1,2 @@
 hello
-world
+there
`

describe('parsePatch', () => {
  it('parses a modified file with additions and deletions', async () => {
    const files = await parsePatch(GIT_DIFF_FIXTURE)
    const foo = files.find(f => f.path === 'src/foo.ts')!
    expect(foo.status).toBe('modified')
    expect(foo.sha).toBe('4b825dc')
    expect(foo.additions).toBe(2)
    expect(foo.deletions).toBe(1)
    expect(foo.isBinary).toBe(false)
    expect(foo.hunks).toHaveLength(1)
  })

  it('parses an added file', async () => {
    const files = await parsePatch(GIT_DIFF_FIXTURE)
    const added = files.find(f => f.path === 'src/new.ts')!
    expect(added.status).toBe('added')
    expect(added.sha).toBe('1234567')
    expect(added.additions).toBe(2)
    expect(added.deletions).toBe(0)
  })

  it('parses a removed file, keying sha off the old blob', async () => {
    const files = await parsePatch(GIT_DIFF_FIXTURE)
    const removed = files.find(f => f.path === 'src/old.ts')!
    expect(removed.status).toBe('removed')
    expect(removed.sha).toBe('89abcde')
    expect(removed.deletions).toBe(2)
  })

  it('parses a pure rename with previousPath set', async () => {
    const files = await parsePatch(GIT_DIFF_FIXTURE)
    const renamed = files.find(f => f.path === 'src/renamed-to.ts')!
    expect(renamed.status).toBe('renamed')
    expect(renamed.previousPath).toBe('src/renamed-from.ts')
    expect(renamed.hunks).toHaveLength(0)
  })

  it('detects a binary file and skips hunk parsing', async () => {
    const files = await parsePatch(GIT_DIFF_FIXTURE)
    const binary = files.find(f => f.path === 'assets/logo.png')!
    expect(binary.isBinary).toBe(true)
    expect(binary.hunks).toHaveLength(0)
  })

  it('falls back to a computed content hash for a plain POSIX diff with no index line', async () => {
    const files = await parsePatch(POSIX_DIFF_FIXTURE)
    expect(files).toHaveLength(1)
    const file = files[0]!
    expect(file.path).toBe('new.txt')
    expect(file.status).toBe('modified')
    // SHA-256 hex digest of the raw chunk text: 64 hex chars, deterministic.
    expect(file.sha).toMatch(/^[0-9a-f]{64}$/)
    const again = await parsePatch(POSIX_DIFF_FIXTURE)
    expect(again[0]!.sha).toBe(file.sha)
  })

  it('reads paths git had to quote, in the header and in renames', async () => {
    const files = await parsePatch([
      'diff --git "a/say \\"hi\\".txt" "b/say \\"hi\\".txt"',
      'index 1111111..2222222 100644',
      '--- "a/say \\"hi\\".txt"',
      '+++ "b/say \\"hi\\".txt"',
      '@@ -1 +1 @@',
      '-a',
      '+b',
      'diff --git "a/tab\\there" "b/caf\\303\\251"',
      'similarity index 100%',
      'rename from "tab\\there"',
      'rename to "caf\\303\\251"',
      '',
    ].join('\n'))
    expect(files.map(f => [f.path, f.previousPath])).toEqual([['say "hi".txt', undefined], ['café', 'tab\there']])
  })
})
