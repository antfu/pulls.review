import { useLocalStorage } from '@vueuse/core'

export const wrapLines = useLocalStorage('diffs:wrap-lines', true)
