import type { Commit, DiffSource } from '@pulls.review/core/types'
import type { DiffsStoreOptions } from '../stores/diffs-store'
import type { DiffsStore } from '../stores/types'
import { computed, effectScope, onScopeDispose, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createDiffsStore } from '../stores/diffs-store'

/** The commits of a diff and which one, if any, is being viewed on its own. */
export interface CommitNav {
  /** Oldest first. */
  commits: Commit[]
  selected?: string
  /** `undefined` returns to the whole diff. */
  select: (sha?: string) => void
}

/**
 * Lets a diff with several commits be read one commit at a time: `?commit=<sha>` on the
 * diff's own route opens that commit as its own store, so the parent (and its commit
 * list) stays mounted while the page swaps what it renders.
 */
export function useCommitView(parent: DiffsStore, sourceFor: (sha: string) => DiffSource, options: DiffsStoreOptions) {
  const route = useRoute()
  const router = useRouter()

  const selected = computed(() => typeof route.query.commit === 'string' ? route.query.commit : undefined)

  // Each commit store lives in its own scope so swapping commits disposes the previous one.
  const commitStore = shallowRef<DiffsStore>()
  let scope: ReturnType<typeof effectScope> | undefined
  watch(selected, (sha) => {
    scope?.stop()
    scope = undefined
    commitStore.value = undefined
    if (sha) {
      scope = effectScope()
      commitStore.value = scope.run(() => createDiffsStore(sourceFor(sha), options))
      commitStore.value!.load()
    }
  }, { immediate: true })
  onScopeDispose(() => scope?.stop())
  // Another commit is another diff: start reading it from the top.
  watch(selected, () => window.scrollTo({ top: 0 }))

  const store = computed(() => commitStore.value ?? parent)

  const commitNav = computed<CommitNav | undefined>(() => {
    const commits = parent.diff?.commits
    if (!commits || commits.length < 2)
      return undefined
    return { commits, selected: selected.value, select }
  })

  function select(sha?: string) {
    router.push({ query: { ...route.query, commit: sha } })
  }

  return { store, commitNav, selected }
}
