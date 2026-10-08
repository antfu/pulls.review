import { useLocalStorage } from '@vueuse/core'
import { computed } from 'vue'

/**
 * Animate the scroll when jumping to a group or file (group tabs, sidebar, sub-nav,
 * file tree). A shared app-wide preference, like `layout.ts` - persisted the same way.
 * Off, a jump lands right away.
 */
export const smoothScroll = useLocalStorage('diffs:smooth-scroll', true)

/** The `behavior` every jump passes to `scrollIntoView`. */
export const scrollBehavior = computed<ScrollBehavior>(() => smoothScroll.value ? 'smooth' : 'instant')
