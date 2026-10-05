import { useLocalStorage, useMediaQuery } from '@vueuse/core'
import { computed } from 'vue'

export type GroupNav = 'tabs' | 'sidebar'

/** Where the group list renders: tabs in the sticky header, or a tree in a left sidebar. */
export const groupNav = useLocalStorage<GroupNav>('diffs:group-nav', 'tabs')

// The sidebar needs the width; below `lg` the tabs take over whatever the preference.
const isWide = useMediaQuery('(min-width: 1024px)')
export const showGroupSidebar = computed(() => groupNav.value === 'sidebar' && isWide.value)
