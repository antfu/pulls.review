import type { SelectedLineRange } from '@pierre/diffs'
import type { DiffSide, FileChange } from '@pulls.review/core/types'
import type { InjectionKey } from 'vue'
import type { FullFileContents } from '../diff/file-diff-input'

/** Diff lines the reviewer picked to ask about; `code` is in unified-diff form. */
export interface ChatQuote {
  /** Path and line range, e.g. `src/a.ts:10-20`; also what tells two quotes apart. */
  label: string
  code: string
}

/**
 * What the reviewer is about to send, owned by `DiffsPage` so a file's diff can add a
 * quote to the chat widget and open it.
 */
export interface ChatDraft {
  open: boolean
  quotes: ChatQuote[]
}

export const chatDraftKey: InjectionKey<ChatDraft> = Symbol('chat-draft')

interface PatchRow {
  old?: number
  new?: number
  text: string
}

function patchRows(file: FileChange): PatchRow[] {
  return file.hunks.flatMap((hunk) => {
    let oldLine = hunk.oldStart
    let newLine = hunk.newStart
    const rows: PatchRow[] = [{ text: hunk.header }]
    for (const text of hunk.patch.split('\n')) {
      if (text.startsWith('+'))
        rows.push({ new: newLine++, text })
      else if (text.startsWith('-'))
        rows.push({ old: oldLine++, text })
      else if (!text.startsWith('\\'))
        rows.push({ old: oldLine++, new: newLine++, text })
    }
    return rows
  })
}

const rowKey = (side: DiffSide) => side === 'deletions' ? 'old' : 'new'

/**
 * The quote for a line selection in `file`'s diff. Lines come from the patch; a
 * selection reaching into expanded unmodified lines is cut from `contents` instead.
 * `undefined` when neither holds every selected line.
 */
export function buildChatQuote(file: FileChange, range: SelectedLineRange, contents?: FullFileContents): ChatQuote | undefined {
  const endSide: DiffSide = range.endSide ?? range.side ?? 'additions'
  const startSide: DiffSide = range.side ?? endSide
  const rows = patchRows(file)
  const startIndex = rows.findIndex(row => row[rowKey(startSide)] === range.start)
  const endIndex = rows.findIndex(row => row[rowKey(endSide)] === range.end)

  if (startSide !== endSide) {
    if (startIndex === -1 || endIndex === -1)
      return undefined
    const ends = [{ side: startSide, line: range.start, index: startIndex }, { side: endSide, line: range.end, index: endIndex }]
      .sort((a, b) => a.index - b.index)
      .map(end => `${end.side === 'deletions' ? 'old' : 'new'} ${end.line}`)
    return {
      label: `${file.path}:${ends.join('-')}`,
      code: rows.slice(Math.min(startIndex, endIndex), Math.max(startIndex, endIndex) + 1).map(row => row.text).join('\n'),
    }
  }

  const first = Math.min(range.start, range.end)
  const last = Math.max(range.start, range.end)
  const label = `${file.path}:${first}${last > first ? `-${last}` : ''}${startSide === 'deletions' ? ' (old)' : ''}`
  if (startIndex !== -1 && endIndex !== -1) {
    const key = rowKey(startSide)
    const code = rows
      .slice(Math.min(startIndex, endIndex), Math.max(startIndex, endIndex) + 1)
      // The other side's changed lines sit between the selected ones in the patch.
      .filter(row => row[key] !== undefined || (row.old === undefined && row.new === undefined))
      .map(row => row.text)
      .join('\n')
    return { label, code }
  }

  const lines = (startSide === 'deletions' ? contents?.old : contents?.new)?.split('\n')
  if (!lines || last > lines.length)
    return undefined
  return { label, code: lines.slice(first - 1, last).map(line => ` ${line}`).join('\n') }
}

/** The chat message for `text` asked about `quotes`: each quote as a labelled `diff` block, then the question. */
export function withQuotes(text: string, quotes: ChatQuote[]): string {
  return [
    ...quotes.map(({ label, code }) => {
      const fence = '`'.repeat(Math.max(2, ...Array.from(code.matchAll(/`+/g), match => match[0].length)) + 1)
      return `\`${label}\`\n${fence}diff\n${code}\n${fence}`
    }),
    text,
  ].join('\n\n')
}
