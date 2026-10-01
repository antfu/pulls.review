import type { Meta, StoryObj } from '@storybook/vue3-vite'
import LayoutSettingsSection from './LayoutSettingsSection.vue'

const meta: Meta<typeof LayoutSettingsSection> = {
  title: 'Settings/LayoutSettingsSection',
  component: LayoutSettingsSection,
}
export default meta

type Story = StoryObj<typeof LayoutSettingsSection>

export const Default: Story = {}
