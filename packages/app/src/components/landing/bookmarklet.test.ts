import { describe, expect, it, vi } from 'vitest'
import { BOOKMARKLET } from './bookmarklet'

/** Runs the bookmarklet against a fake page and returns where it navigates, if anywhere. */
function run(url: string): { href?: string, alerted: boolean } {
  const { hostname, pathname } = new URL(url)
  const location = { hostname, pathname, href: url }
  const alert = vi.fn()
  // eslint-disable-next-line no-new-func
  new Function('location', 'alert', BOOKMARKLET.slice('javascript:'.length))(location, alert)
  return { href: location.href === url ? undefined : location.href, alerted: alert.mock.calls.length > 0 }
}

describe('bookmarklet', () => {
  it('stays on one line without percent signs', () => {
    expect(BOOKMARKLET).toMatch(/^javascript:/)
    expect(BOOKMARKLET).not.toMatch(/[\n%]/)
  })

  it.each([
    ['https://github.com/antfu/pulls.review/pull/45', 'https://pulls.review/gh/antfu/pulls.review/45'],
    ['https://github.com/antfu/pulls.review/pull/45/files', 'https://pulls.review/gh/antfu/pulls.review/45'],
    ['https://github.com/antfu/pulls.review/commit/a04a61d', 'https://pulls.review/gh/antfu/pulls.review/commit/a04a61d'],
    ['https://github.com/antfu/pulls.review/compare/main...feat/x', 'https://pulls.review/gh/antfu/pulls.review/compare/main...feat/x'],
    ['https://github.com/antfu/pulls.review/pulls', 'https://pulls.review/gh/antfu/pulls.review'],
  ])('opens %s on pulls.review', (from, to) => {
    expect(run(from)).toEqual({ href: to, alerted: false })
  })

  it.each([
    ['https://pulls.review/gh/antfu/pulls.review/45', 'https://github.com/antfu/pulls.review/pull/45'],
    ['https://pulls.review/gh/antfu/pulls.review/commit/a04a61d', 'https://github.com/antfu/pulls.review/commit/a04a61d'],
    ['https://pulls.review/gh/antfu/pulls.review/compare/main...feat/x', 'https://github.com/antfu/pulls.review/compare/main...feat/x'],
    ['https://pulls.review/gh/antfu/pulls.review', 'https://github.com/antfu/pulls.review/pulls'],
  ])('opens %s on github.com', (from, to) => {
    expect(run(from)).toEqual({ href: to, alerted: false })
  })

  it.each([
    'https://github.com/antfu/pulls.review',
    'https://github.com/antfu/pulls.review/compare/main',
    'https://pulls.review/',
    'https://example.com/antfu/pulls.review/pull/45',
  ])('alerts on %s', (url) => {
    expect(run(url)).toEqual({ href: undefined, alerted: true })
  })
})
