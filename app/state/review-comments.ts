import { useLocalStorage } from '@vueuse/core'

/**
 * Whether existing (submitted) review comment threads render inline in diffs.
 * The viewer's own pending draft comments always render regardless - hiding
 * in-flight work would be a footgun. Same ambient-singleton pattern as
 * `layout.ts`, shared across every diff view including the embed.
 */
export const showReviewComments = useLocalStorage('diffs:show-review-comments', true)
