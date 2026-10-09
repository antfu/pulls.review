import type { Meta, StoryObj } from '@storybook/vue3-vite'
import NavigationSettingsSection from './NavigationSettingsSection.vue'

const meta: Meta<typeof NavigationSettingsSection> = {
  title: 'Settings/NavigationSettingsSection',
  component: NavigationSettingsSection,
}
export default meta

type Story = StoryObj<typeof NavigationSettingsSection>

export const Default: Story = {}
