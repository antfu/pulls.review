import { describe, expect, it } from 'vitest'
import { resolveGithubToken, resolveLlmSettings, resolveLocale, resolveTarget } from './config'

describe('resolveLlmSettings', () => {
  it('picks the provider from the first conventional key present', () => {
    expect(resolveLlmSettings({ ANTHROPIC_API_KEY: 'sk-ant' })).toMatchObject({ provider: 'anthropic', anthropicApiKey: 'sk-ant' })
    expect(resolveLlmSettings({ OPENAI_API_KEY: 'sk-oa', OPENAI_BASE_URL: 'https://llm.local/v1' })).toMatchObject({ provider: 'openai-compatible', openaiApiKey: 'sk-oa', openaiBaseUrl: 'https://llm.local/v1' })
    expect(resolveLlmSettings({ AI_GATEWAY_API_KEY: 'gw', ANTHROPIC_API_KEY: 'sk-ant' })).toMatchObject({ provider: 'gateway', gatewayToken: 'gw' })
  })

  it('lets PULLS_REVIEW_* override the conventional variables for the selected provider', () => {
    const llm = resolveLlmSettings({
      PULLS_REVIEW_PROVIDER: 'openai-compatible',
      PULLS_REVIEW_API_KEY: 'prefixed',
      PULLS_REVIEW_BASE_URL: 'https://prefixed/v1',
      PULLS_REVIEW_MODEL: 'my-model',
      OPENAI_API_KEY: 'conventional',
      OPENAI_BASE_URL: 'https://conventional/v1',
      AI_GATEWAY_API_KEY: 'gw',
    })
    expect(llm).toMatchObject({ provider: 'openai-compatible', openaiApiKey: 'prefixed', openaiBaseUrl: 'https://prefixed/v1', openaiModel: 'my-model' })
  })

  it('lets flags override the environment', () => {
    const llm = resolveLlmSettings({ PULLS_REVIEW_PROVIDER: 'gateway', PULLS_REVIEW_MODEL: 'env-model', AI_GATEWAY_API_KEY: 'gw', ANTHROPIC_API_KEY: 'sk' }, { provider: 'anthropic', model: 'flag-model' })
    expect(llm).toMatchObject({ provider: 'anthropic', anthropicModel: 'flag-model', gatewayModel: 'anthropic/claude-sonnet-5' })
  })

  it('treats blank values as unset, as Action inputs arrive', () => {
    expect(resolveLlmSettings({ PULLS_REVIEW_PROVIDER: '', PULLS_REVIEW_API_KEY: '', ANTHROPIC_API_KEY: 'sk-ant' })).toMatchObject({ provider: 'anthropic', anthropicApiKey: 'sk-ant' })
  })

  it('rejects an unknown provider', () => {
    expect(() => resolveLlmSettings({ PULLS_REVIEW_PROVIDER: 'bard' })).toThrow(/Unknown provider "bard"/)
  })
})

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
