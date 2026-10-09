import { useLocalStorage } from '@vueuse/core'

export const autoFetchFullFile = useLocalStorage('diffs:auto-fetch-full-file', false)
