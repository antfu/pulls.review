import type { InjectionKey, Ref } from 'vue'

export interface FileContentContext {
  owner: string
  repo: string
  baseSha: string
  headSha: string
}

/**
 * Provided by whatever top-level view owns a `DiffsPayload` (`DiffsPage.vue`), and
 * injected by `FileDiff.vue` to know whether/how to fetch a file's full content at
 * the PR's base/head refs - `undefined` for sources that can't (a pasted patch has
 * no live source to refetch from). Provide/inject rather than prop-drilling through
 * `DiffGroup.vue`, which otherwise carries no provider/ref info at all - same pattern
 * as `state/dark.ts`'s `isDarkKey`.
 */
export const fileContentContextKey: InjectionKey<Ref<FileContentContext | undefined>> = Symbol('diffs-file-content-context')
