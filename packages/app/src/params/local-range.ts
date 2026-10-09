import type { LocalPage } from '../local/pages'
import { defineParamParser } from 'vue-router/experimental'

export const parser = defineParamParser<Extract<LocalPage, { kind: 'compare' }>>({
  get: range => ({ kind: 'compare', range }),
  set: page => page.range,
})
