import { defaultLlmSettings } from '@pulls.review/core/analyze'
import { beforeEach, describe, expect, it } from 'vitest'
import { settingsCredentials } from './app-context'
import { settings } from './state/settings'

describe('settingsCredentials', () => {
  beforeEach(() => {
    settings.value = { githubToken: 'github-tok', gitlabTokens: { 'gitlab.com': 'gitlab-tok', 'gitlab.example.com': 'self-managed-tok' }, llm: { ...defaultLlmSettings }, locale: 'en' }
  })

  it('keeps the GitHub and GitLab tokens apart', async () => {
    expect(await settingsCredentials.githubToken()).toBe('github-tok')
    expect(await settingsCredentials.gitlabToken!('gitlab.com')).toBe('gitlab-tok')
  })

  it('gives each instance its own token, and an unknown one none', async () => {
    expect(await settingsCredentials.gitlabToken!('gitlab.example.com')).toBe('self-managed-tok')
    expect(await settingsCredentials.gitlabToken!('evil-gitlab.com')).toBeUndefined()
  })

  it('reads a token saved later without being rebuilt, and an empty one as none', async () => {
    settings.value = { ...settings.value, gitlabTokens: { 'gitlab.com': '' } }
    expect(await settingsCredentials.gitlabToken!('gitlab.com')).toBeUndefined()
    expect(await settingsCredentials.githubToken()).toBe('github-tok')
  })
})
