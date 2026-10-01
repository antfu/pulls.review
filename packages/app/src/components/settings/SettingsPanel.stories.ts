import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { defaultLlmSettings } from '@pulls.review/core'
import SettingsPanel from './SettingsPanel.vue'

const meta: Meta<typeof SettingsPanel> = {
  title: 'Settings/SettingsPanel',
  component: SettingsPanel,
}
export default meta

type Story = StoryObj<typeof SettingsPanel>

const githubTokenMeta = {
  login: 'octocat',
  avatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4',
  name: 'The Octocat',
  scopes: ['repo', 'read:org'],
  expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 60,
  setAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
}

export const Empty: Story = {
  args: {
    githubTokenSet: false,
    githubTokenMeta: null,
    llmSettings: defaultLlmSettings,
    models: null,
  },
}

export const Configured: Story = {
  args: {
    githubTokenSet: true,
    githubTokenMeta,
    llmSettings: { ...defaultLlmSettings, gatewayToken: 'vck_exampletoken1234' },
    models: [
      { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5', pricing: { input: 3, output: 15 } },
      { id: 'openai/gpt-5.1', name: 'GPT-5.1', pricing: { input: 1.25, output: 10 } },
      { id: 'meta/llama-4-free', name: 'Llama 4 (free)', pricing: { input: 0, output: 0 } },
    ],
  },
}

export const TokenResolving: Story = {
  args: {
    githubTokenSet: true,
    githubTokenMeta: null,
    githubTokenBusy: true,
    llmSettings: defaultLlmSettings,
    models: null,
  },
}

export const Errors: Story = {
  args: {
    githubTokenSet: true,
    githubTokenMeta: null,
    githubTokenError: 'GitHub rejected this token (401). Check that it was pasted completely and has not been revoked.',
    llmSettings: { ...defaultLlmSettings, provider: 'anthropic', anthropicApiKey: 'sk-ant-example' },
    models: null,
    modelsError: 'Anthropic API request failed (401)',
  },
}
