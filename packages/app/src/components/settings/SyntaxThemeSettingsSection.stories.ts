import type { Meta, StoryObj } from '@storybook/vue3-vite'
import SyntaxThemeSettingsSection from './SyntaxThemeSettingsSection.vue'

const meta: Meta<typeof SyntaxThemeSettingsSection> = {
  title: 'Settings/SyntaxThemeSettingsSection',
  component: SyntaxThemeSettingsSection,
}
export default meta

type Story = StoryObj<typeof SyntaxThemeSettingsSection>

export const Default: Story = {}
