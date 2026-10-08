import type { SharedAnalysis } from '../types/shared-analysis'
import { compressToBase64, decompressFromBase64 } from 'lz-string-es'
import * as v from 'valibot'
import { diagnostics } from '../diagnostics'
import { SharedAnalysisSchema } from '../types/shared-analysis'

/**
 * The body of a shared-analysis comment, the same on every host that carries one
 * (see plans/07-share-result.md): a marker line, a link back to the site, and the
 * analysis as a fenced block.
 */

/** Never `location.origin`: the comment is public, a preview host must not leak into it. */
export const SITE_ORIGIN = 'https://pulls.review'
const MARKER = '<!-- pulls.review data -->'

export interface SharedAnalysisBodyOptions {
  /** The site URL that reopens this diff with the analysis loaded. */
  link: string
  /** What the host calls the thing under review, e.g. `pull request`. */
  subject: string
  /** The longest body the host accepts. */
  maxLength: number
}

function formatUtcMinutes(iso: string): string {
  return iso.replace('T', ' ').slice(0, 16)
}

/**
 * The payload as a fenced block: readable `json` when it fits, otherwise
 * lz-string base64 under an `lz-string` fence so large analyses still fit
 * the host's limit. `parseSharedAnalysisBody` reads both.
 */
function renderPayload(analysis: SharedAnalysis, compress: boolean): string {
  return compress
    ? ['```lz-string', compressToBase64(JSON.stringify(analysis)), '```'].join('\n')
    : ['```json', JSON.stringify(analysis, null, 2), '```'].join('\n')
}

export function renderSharedAnalysisBody(analysis: SharedAnalysis, { link, subject, maxLength }: SharedAnalysisBodyOptions): string {
  const { result } = analysis
  const render = (compress: boolean) => [
    MARKER,
    `👁️‍🗨️ Review this ${subject} with grouped, summarized diffs at:`,
    `👉 ${link}`,
    '',
    `<details><summary>raw result</summary>`,
    '',
    '<br>',
    '',
    `💭 analyzed by \`${result.model ?? result.source}\``,
    `🕰️ ${formatUtcMinutes(result.generatedAt)} UTC`,
    `🔗 head ${analysis.headSha.slice(0, 7)}`,
    `🤖 automated by [pulls.review](${SITE_ORIGIN})`,
    '',
    renderPayload(analysis, compress),
    '',
    '</details>',
    '',
  ].join('\n')

  const plain = render(false)
  if (plain.length <= maxLength)
    return plain
  const compressed = render(true)
  if (compressed.length > maxLength)
    throw diagnostics.commentTooLarge({ n: compressed.length })
  return compressed
}

/** `undefined` for anything that isn't a well-formed pulls.review comment - never throws. */
export function parseSharedAnalysisBody(body: string): SharedAnalysis | undefined {
  if (!body.startsWith(MARKER))
    return undefined
  const match = body.match(/```(json|lz-string)\n([\s\S]*?)\n```/)
  if (!match)
    return undefined
  try {
    const json = match[1] === 'lz-string' ? decompressFromBase64(match[2]!) : match[2]!
    if (!json)
      return undefined
    const parsed = v.safeParse(SharedAnalysisSchema, JSON.parse(json))
    return parsed.success ? parsed.output : undefined
  }
  catch {
    return undefined
  }
}
