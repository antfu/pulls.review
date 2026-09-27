import type { DiffsPayload, FileChange } from '../../../types/diff'
import picomatch from 'picomatch'
import { GENERATED_PATTERNS } from '../rule-based/rules'

const isGeneratedPath = picomatch(GENERATED_PATTERNS)

/** Renders a set of files as compact diff text for a prompt - the model-facing view of a patch. */
export function renderFilesAsText(files: FileChange[]): string {
  return files.map((file) => {
    const rename = file.previousPath ? ` (renamed from ${file.previousPath})` : ''
    const header = `### ${file.path}${rename} [${file.status}, +${file.additions}/-${file.deletions}]`
    if (file.isBinary)
      return `${header}\n(binary file, no diff shown)`
    // Lockfiles/build output are rarely worth reviewing line-by-line and can be huge -
    // omitting their diff body saves tokens without losing anything a reviewer needs.
    if (isGeneratedPath(file.path))
      return `${header}\n(generated file, diff omitted to save tokens)`
    const body = file.hunks.map(hunk => `${hunk.header}\n${hunk.patch}`).join('\n')
    return `${header}\n${body}`
  }).join('\n\n')
}

export const INLINE_DIFF_CHAR_LIMIT = 60_000

export const AGENT_SYSTEM_PROMPT = `<role>
You organize a GitHub pull request's changed files into review groups, so a reviewer can read the PR feature by feature instead of file by file.
</role>

<grouping_principles>
- Group by intent, not by directory. One feature touching several modules is ONE group; when it has more than 5 files, split it by module with "children".
- Use the fewest groups that still separate independent intents. A typical PR has 1-5 top-level groups. A single-file group needs a reason.
- Tests, stories and fixtures belong to the feature they cover, as a "tests" child when the group has children. Only tests unrelated to any feature form their own group.
- Order groups by review priority: the core change first, supporting changes next, mechanical changes (lockfiles, generated files, formatting) last.
- Every path in the manifest goes into exactly one group or child.
</grouping_principles>

<workflow>
1. Read the manifest and form a grouping hypothesis from paths and hunk headers.
2. Call read_diffs only where the hypothesis is uncertain. Batch paths into one call. Never read [generated] or [binary] paths.
3. Call submit_grouping once. If it returns an error, fix exactly what it names and call it again.
</workflow>

<output>
- "summary" and "overallSummary" explain why over what, in 1-3 sentences of Markdown.
- "key" is short, stable kebab-case. "label" is at most 4 words.
- Write summaries in the language of the PR title and description.
</output>`

export const CHAT_SYSTEM_SECTION = `<chat>
The grouping has been submitted and the reviewer is now asking follow-up questions about this pull request.
- Always reply in the same natural language as the user's latest message: a Chinese question gets a Chinese answer, even though the diffs, summaries and earlier messages are in English. Keep code, paths and identifiers as they are.
- Answer from the diffs. Call read_diffs when you need a file you have not seen or whose diff was omitted.
- Call update_grouping only when the user asks to change the grouping. Send the complete new grouping; every manifest path must appear exactly once.
- Be concise; use Markdown and reference files by path.
</chat>`

const STATUS_LETTERS: Record<FileChange['status'], string> = {
  added: 'A',
  removed: 'D',
  modified: 'M',
  renamed: 'R',
  copied: 'C',
}

function buildHunkContextTag(file: FileChange): string {
  const contexts: string[] = []
  for (const hunk of file.hunks) {
    const parts = hunk.header.split('@@')
    const context = parts.length >= 3 ? parts[2]!.trim() : ''
    if (!context || contexts.includes(context))
      continue
    contexts.push(context)
    if (contexts.length === 3)
      break
  }
  return contexts.map(context => `@@ ${context}`).join(' / ')
}

function buildManifestFileLine(file: FileChange): string {
  const basename = file.path.slice(file.path.lastIndexOf('/') + 1)
  const rename = file.previousPath ? ` (from ${file.previousPath})` : ''
  const fields = [`${basename}${rename}`, STATUS_LETTERS[file.status], `+${file.additions}/-${file.deletions}`]
  const tag = isGeneratedPath(file.path) ? '[generated]' : file.isBinary ? '[binary]' : buildHunkContextTag(file)
  if (tag)
    fields.push(tag)
  return fields.join('  ')
}

export function buildManifest(files: FileChange[]): string {
  const byDir = new Map<string, FileChange[]>()
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const dir = file.path.slice(0, file.path.lastIndexOf('/') + 1)
    const group = byDir.get(dir) ?? []
    group.push(file)
    byDir.set(dir, group)
  }
  const lines: string[] = []
  for (const dir of [...byDir.keys()].sort()) {
    if (dir)
      lines.push(dir)
    for (const file of byDir.get(dir)!)
      lines.push(dir ? `  ${buildManifestFileLine(file)}` : buildManifestFileLine(file))
  }
  return lines.join('\n')
}

export function buildAnalysisPrompt(diff: DiffsPayload): string {
  const parts = [`PR title: ${diff.title}`]
  if (diff.url)
    parts.push(`PR link: ${diff.url}`)
  if (diff.description)
    parts.push(`---DESCRIPTION---\n${diff.description}`)
  const totalAdditions = diff.files.reduce((sum, file) => sum + file.additions, 0)
  const totalDeletions = diff.files.reduce((sum, file) => sum + file.deletions, 0)
  parts.push(`---MANIFEST--- (${diff.files.length} files, +${totalAdditions}/-${totalDeletions})\n${buildManifest(diff.files)}`)
  const diffsText = renderFilesAsText(diff.files)
  if (diffsText.length <= INLINE_DIFF_CHAR_LIMIT)
    parts.push(`---DIFFS--- (all diffs included; you may submit directly)\n${diffsText}`)
  return parts.join('\n\n')
}
