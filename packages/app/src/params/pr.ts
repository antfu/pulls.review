import { defineParamParser, miss } from 'vue-router/experimental'

export const parser = defineParamParser<string>({
  get(value) {
    if (!/^\d+$/.test(value))
      return miss('Expected a pull request number')
    return value
  },
  set: value => value,
})
