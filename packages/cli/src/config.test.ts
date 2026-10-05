import { describe, expect, it } from 'vitest'
import { resolveGithubToken, resolveLocale, resolveTarget } from './config'

describe('resolveGithubToken', () => {
  it('prefers the prefixed variable and requires one of them', () => {
    expect(resolveGithubToken({ GITHUB_TOKEN: 'a', PULLS_REVIEW_GITHUB_TOKEN: 'b' })).toBe('b')
    expect(resolveGithubToken({ GITHUB_TOKEN: 'a' })).toBe('a')
    expect(() => resolveGithubToken({})).toThrow(/GitHub token is required/)
  })
})

describe('resolveLocale', () => {
  it('defaults to English and validates the tag', () => {
    expect(resolveLocale({})).toBe('en')
    expect(resolveLocale({ PULLS_REVIEW_LOCALE: 'zh-CN' })).toBe('zh-CN')
    expect(resolveLocale({ PULLS_REVIEW_LOCALE: 'zh-CN' }, { locale: 'ja' })).toBe('ja')
    expect(() => resolveLocale({ PULLS_REVIEW_LOCALE: 'xx' })).toThrow(/Unsupported locale/)
  })
})

describe('resolveTarget', () => {
  it('reads owner/repo#number and github.com URLs', () => {
    expect(resolveTarget('antfu/pulls.review#12', {})).toEqual({ owner: 'antfu', repo: 'pulls.review', number: '12' })
    expect(resolveTarget('https://github.com/vuejs/core/pull/12349', {})).toEqual({ owner: 'vuejs', repo: 'core', number: '12349' })
    expect(() => resolveTarget('vuejs/core', {})).toThrow(/expected owner\/repo#123/)
  })

  it('falls back to the pull_request event of the workflow run', () => {
    expect(resolveTarget(undefined, { GITHUB_REPOSITORY: 'o/r' }, { pull_request: { number: 7 } })).toEqual({ owner: 'o', repo: 'r', number: '7' })
    expect(() => resolveTarget(undefined, { GITHUB_REPOSITORY: 'o/r' }, {})).toThrow(/No pull request given/)
    expect(() => resolveTarget(undefined, {})).toThrow(/No pull request given/)
  })
})
