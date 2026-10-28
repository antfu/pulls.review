const INSTRUCTION_PATHS = ['AGENTS.md', '.github/muse-instructions.md', '.pulls-review/instructions.md']
const MAX_INSTRUCTION_CHARS = 16_000

/**
 * Repository-authored review instructions from the PR's base ref, read with
 * the installation token. Reading the base (never the PR head) keeps a PR
 * from rewriting the instructions it is reviewed under. Fail-soft: any
 * error simply yields no instructions.
 */
export async function fetchRepositoryInstructions(
  token: string,
  owner: string,
  repo: string,
  ref: string | undefined,
  fetchFn: typeof fetch = fetch,
): Promise<string | undefined> {
  const sections: string[] = []
  for (const path of INSTRUCTION_PATHS) {
    try {
      const query = ref ? `?ref=${encodeURIComponent(ref)}` : ''
      const res = await fetchFn(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}${query}`, {
        headers: new Headers({
          'Accept': 'application/vnd.github.raw+json',
          'Authorization': `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'pulls.review',
        }),
      })
      if (!res.ok)
        continue
      const text = (await res.text()).trim()
      if (text)
        sections.push(`## ${path}\n${text}`)
    }
    catch {
      // Instructions are best-effort context, never a reason to fail a run.
    }
  }
  const joined = sections.join('\n\n').slice(0, MAX_INSTRUCTION_CHARS)
  return joined || undefined
}
