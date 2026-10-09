import type { LocalPage } from '../local/pages'
import { defineParamParser } from 'vue-router/experimental'

export const parser = defineParamParser<Extract<LocalPage, { kind: 'commit' }>>({
  get: sha => ({ kind: 'commit', sha }),
  set: page => page.sha,
})
