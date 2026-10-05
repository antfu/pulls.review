import { describe, expect, it } from 'vitest'
import { parseTarget } from './target'

describe('parseTarget', () => {
  it('reads git revision syntax', () => {
    expect(parseTarget('')).toEqual({ kind: 'worktree' })
    expect(parseTarget('abc123')).toEqual({ kind: 'commit', rev: 'abc123' })
    expect(parseTarget('main...feat/x')).toEqual({ kind: 'range', base: 'main', head: 'feat/x', mergeBase: true })
    expect(parseTarget('v1..v2')).toEqual({ kind: 'range', base: 'v1', head: 'v2', mergeBase: false })
  })

  it('reads an empty side of a range as HEAD, like git', () => {
    expect(parseTarget('main...')).toEqual({ kind: 'range', base: 'main', head: 'HEAD', mergeBase: true })
  })

  it('rejects a revision starting with a dash', () => {
    expect(() => parseTarget('main..--all')).toThrow(/Invalid revision/)
  })
})
