import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { defaultLlmSettings } from '@pulls.review/core/analyze'
import SettingsPanel from './SettingsPanel.vue'

const meta: Meta<typeof SettingsPanel> = {
  title: 'Settings/SettingsPanel',
  component: SettingsPanel,
}
export default meta

type Story = StoryObj<typeof SettingsPanel>

const githubAccount = {
  id: 583231,
  login: 'octocat',
  avatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4',
  name: 'The Octocat',
}

export const SignedOut: Story = {
  args: {
    githubAccount: null,
    githubOauthAvailable: true,
    llmSettings: defaultLlmSettings,
    models: null,
  },
}

export const Configured: Story = {
  args: {
    githubAccount,
    githubOauthAvailable: true,
    llmSettings: { ...defaultLlmSettings, gatewayToken: 'vck_exampletoken1234' },
    models: [
      { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5', pricing: { input: 3, output: 15 } },
      { id: 'openai/gpt-5.1', name: 'GPT-5.1', pricing: { input: 1.25, output: 10 } },
      { id: 'meta/llama-4-free', name: 'Llama 4 (free)', pricing: { input: 0, output: 0 } },
    ],
  },
}

export const ModelError: Story = {
  args: {
    githubAccount,
    githubOauthAvailable: true,
    llmSettings: { ...defaultLlmSettings, provider: 'anthropic', anthropicApiKey: 'sk-ant-example' },
    models: null,
    modelsError: 'Anthropic API request failed (401)',
  },
}
