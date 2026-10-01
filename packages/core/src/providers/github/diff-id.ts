/**
 * Parses a github-provider `DiffsPayload.id` (`github:{owner}/{repo}#{number}`) back
 * into its parts - `undefined` for a paste/local id, which has no such structure.
 */
export function parseGithubDiffId(id: string): { owner: string, repo: string, number: string } | undefined {
  const match = id.match(/^github:([^/]+)\/([^#]+)#(\d+)$/)
  if (!match)
    return undefined
  return { owner: match[1]!, repo: match[2]!, number: match[3]! }
}
