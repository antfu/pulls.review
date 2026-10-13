import type { LocalPage } from '../local/pages'
import { defineParamParser } from 'vue-router/experimental'

export const parser = defineParamParser<Extract<LocalPage, { kind: 'branch' }>>({
  get: branch => ({ kind: 'branch', branch }),
  set: page => page.branch,
})
