import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ModelPicker from './ModelPicker.vue'

const meta: Meta<typeof ModelPicker> = {
  title: 'Settings/ModelPicker',
  component: ModelPicker,
}
export default meta

type Story = StoryObj<typeof ModelPicker>

const models = [
  { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5', pricing: { input: 3, output: 15 } },
  { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5', pricing: { input: 1, output: 5 } },
  { id: 'openai/gpt-5.1', name: 'GPT-5.1', pricing: { input: 1.25, output: 10 } },
  { id: 'meta/llama-4-free', name: 'Llama 4 (free)', pricing: { input: 0, output: 0 } },
  { id: 'zai/glm-4.7', name: 'GLM 4.7' },
]

export const WithPricing: Story = {
  args: { models, modelValue: 'anthropic/claude-sonnet-5' },
}

export const NamesOnly: Story = {
  args: {
    models: models.map(({ id, name }) => ({ id, name })),
    modelValue: 'anthropic/claude-sonnet-5',
  },
}

export const Loading: Story = {
  args: { models: null, loading: true, modelValue: 'anthropic/claude-sonnet-5' },
}

export const FetchFailed: Story = {
  args: { models: null, error: 'Model list request failed (401)', modelValue: 'gpt-5.1' },
}
