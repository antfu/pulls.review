import { StorageSerializers, useLocalStorage, useMediaQuery } from '@vueuse/core'
import { computed } from 'vue'

export type GroupNav = 'tabs' | 'sidebar'

/** Where the group list renders: tabs in the sticky header, or a tree in a left sidebar. */
export const groupNav = useLocalStorage<GroupNav>('diffs:group-nav', 'tabs')

/** At `lg` and up. Below it the tabs replace the sidebar, whatever the preference. */
export const isWide = useMediaQuery('(min-width: 1024px)')
export const showGroupSidebar = computed(() => groupNav.value === 'sidebar' && isWide.value)

/** Narrowest the sidebar goes. */
export const GROUP_SIDEBAR_MIN_WIDTH = 192
/** Widest share of the page the sidebar may take. */
export const GROUP_SIDEBAR_MAX_RATIO = 0.4

/** The width, in px, the user dragged the sidebar to; `null` keeps the default `w-64`. */
export const groupSidebarWidth = useLocalStorage<number | null>('diffs:group-sidebar-width', null, {
  serializer: StorageSerializers.number,
})
