import { useLocalStorage } from '@vueuse/core'

/**
 * When a cached PR is found to have new commits, refresh it automatically instead of
 * showing the "new commits" banner. A shared app-wide preference, like `layout.ts` -
 * persisted the same way. Off until the user opts in (via the banner checkbox or
 * Settings), so the banner still shows the first time a PR goes stale.
 */
export const autoRefresh = useLocalStorage('diffs:auto-refresh', false)
