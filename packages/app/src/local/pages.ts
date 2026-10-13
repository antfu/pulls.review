import type { LocalRpc } from './connection'
import { LOCAL_RPC } from '@pulls.review/core/local-rpc'
import * as v from 'valibot'

/** What a local review page shows; the server holds no target, every page names its own. */
export type LocalPage
  = | { kind: 'compare', range: string }
    | { kind: 'branch', branch: string }
    | { kind: 'worktree' }
    | { kind: 'commit', sha: string }

export const RepoInfoSchema = v.object({
  currentBranch: v.optional(v.string()),
  defaultBranch: v.optional(v.object({ name: v.string(), ref: v.string() })),
  branches: v.array(v.string()),
  tags: v.array(v.string()),
  commits: v.array(v.object({ sha: v.string(), subject: v.string() })),
})
export type RepoInfo = v.InferOutput<typeof RepoInfoSchema>

export async function readRepoInfo(rpc: LocalRpc): Promise<RepoInfo> {
  return v.parse(RepoInfoSchema, await rpc.call(LOCAL_RPC.repoInfo))
}

export function routeForPage(page: LocalPage): string {
  switch (page.kind) {
    case 'compare':
      return `/compare/${encodeURI(page.range).replaceAll('#', '%23')}`
    case 'branch':
      return `/branch/${encodeURI(page.branch).replaceAll('#', '%23')}`
    case 'worktree':
      return '/worktree'
    case 'commit':
      return `/commit/${page.sha}`
  }
}

/** The git target a page reviews: a branch is what it adds since forking from the default branch. */
export async function targetFor(page: LocalPage, rpc: LocalRpc): Promise<string> {
  switch (page.kind) {
    case 'compare':
      return page.range
    case 'branch': {
      const base = (await readRepoInfo(rpc)).defaultBranch
      if (!base)
        throw new Error('No default branch (origin/HEAD, main or master) to compare against.')
      return `${base.ref}...${page.branch}`
    }
    case 'worktree':
      return ''
    case 'commit':
      return page.sha
  }
}
