import { splitRange } from '@pulls.review/core/github'
import { defineParamParser, miss } from 'vue-router/experimental'

export const parser = defineParamParser<{ base: string, head: string }>({
  get(value) {
    const range = splitRange(value)
    if (!range)
      return miss('Expected base...head')
    return range
  },
  set: ({ base, head }) => `${base}...${head}`,
})
