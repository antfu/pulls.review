import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { defaultLlmSettings } from '@pulls.review/core/analyze'
import LlmSettingsSection from './LlmSettingsSection.vue'

const meta: Meta<typeof LlmSettingsSection> = {
  title: 'Settings/LlmSettingsSection',
  component: LlmSettingsSection,
}
export default meta

type Story = StoryObj<typeof LlmSettingsSection>

const models = [
  { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5', pricing: { input: 3, output: 15 } },
  { id: 'openai/gpt-5.1', name: 'GPT-5.1', pricing: { input: 1.25, output: 10 } },
]

export const NoToken: Story = {
  args: { llmSettings: defaultLlmSettings, models: null },
}

export const GatewayConfigured: Story = {
  args: {
    llmSettings: { ...defaultLlmSettings, gatewayToken: 'vck_exampletoken1234' },
    models,
  },
}

export const OpenAiCompatibleConfigured: Story = {
  args: {
    llmSettings: {
      ...defaultLlmSettings,
      provider: 'openai-compatible',
      openaiApiKey: 'sk-exampletoken1234',
      openaiBaseUrl: 'https://llm.example.com/v1',
    },
    models: [{ id: 'gpt-5.1', name: 'gpt-5.1' }],
  },
}

export const ModelsLoading: Story = {
  args: {
    llmSettings: { ...defaultLlmSettings, gatewayToken: 'vck_exampletoken1234' },
    models: null,
    modelsLoading: true,
  },
}

export const ModelsFetchFailed: Story = {
  args: {
    llmSettings: { ...defaultLlmSettings, provider: 'anthropic', anthropicApiKey: 'sk-ant-example' },
    models: null,
    modelsError: 'Anthropic API request failed (401)',
  },
}
