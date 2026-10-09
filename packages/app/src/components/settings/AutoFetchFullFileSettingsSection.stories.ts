import type { Meta, StoryObj } from '@storybook/vue3-vite'
import AutoFetchFullFileSettingsSection from './AutoFetchFullFileSettingsSection.vue'

const meta: Meta<typeof AutoFetchFullFileSettingsSection> = {
  title: 'Settings/AutoFetchFullFileSettingsSection',
  component: AutoFetchFullFileSettingsSection,
}
export default meta

type Story = StoryObj<typeof AutoFetchFullFileSettingsSection>

export const Default: Story = {}
