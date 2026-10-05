import { describe, expect, it } from 'vitest'
import { githubTokenFromEnv, llmSettingsFromEnv } from './env'

describe('llmSettingsFromEnv', () => {
  it('picks the provider from the first conventional key present', () => {
    expect(llmSettingsFromEnv({ ANTHROPIC_API_KEY: 'sk-ant' })).toMatchObject({ provider: 'anthropic', anthropicApiKey: 'sk-ant' })
    expect(llmSettingsFromEnv({ OPENAI_API_KEY: 'sk-oa', OPENAI_BASE_URL: 'https://llm.local/v1' })).toMatchObject({ provider: 'openai-compatible', openaiApiKey: 'sk-oa', openaiBaseUrl: 'https://llm.local/v1' })
    expect(llmSettingsFromEnv({ AI_GATEWAY_API_KEY: 'gw', ANTHROPIC_API_KEY: 'sk-ant' })).toMatchObject({ provider: 'gateway', gatewayToken: 'gw' })
  })

  it('lets PULLS_REVIEW_* override the conventional variables for the selected provider', () => {
    const llm = llmSettingsFromEnv({
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
    const llm = llmSettingsFromEnv({ PULLS_REVIEW_PROVIDER: 'gateway', PULLS_REVIEW_MODEL: 'env-model', AI_GATEWAY_API_KEY: 'gw', ANTHROPIC_API_KEY: 'sk' }, { provider: 'anthropic', model: 'flag-model' })
    expect(llm).toMatchObject({ provider: 'anthropic', anthropicModel: 'flag-model', gatewayModel: 'anthropic/claude-sonnet-5' })
  })

  it('treats blank values as unset, as Action inputs arrive', () => {
    expect(llmSettingsFromEnv({ PULLS_REVIEW_PROVIDER: '', PULLS_REVIEW_API_KEY: '', ANTHROPIC_API_KEY: 'sk-ant' })).toMatchObject({ provider: 'anthropic', anthropicApiKey: 'sk-ant' })
  })

  it('rejects an unknown provider', () => {
    expect(() => llmSettingsFromEnv({ PULLS_REVIEW_PROVIDER: 'bard' })).toThrow(/Unknown provider "bard"/)
  })
})

describe('githubTokenFromEnv', () => {
  it('prefers the prefixed variable and treats blanks as unset', () => {
    expect(githubTokenFromEnv({ GITHUB_TOKEN: 'a', PULLS_REVIEW_GITHUB_TOKEN: 'b' })).toBe('b')
    expect(githubTokenFromEnv({ GITHUB_TOKEN: 'a', PULLS_REVIEW_GITHUB_TOKEN: '' })).toBe('a')
    expect(githubTokenFromEnv({})).toBeUndefined()
  })
})
