import type { Meta, StoryObj } from '@storybook/vue3-vite'
import LanguageSettingsSection from './LanguageSettingsSection.vue'

const meta: Meta<typeof LanguageSettingsSection> = {
  title: 'Settings/LanguageSettingsSection',
  component: LanguageSettingsSection,
}
export default meta

type Story = StoryObj<typeof LanguageSettingsSection>

export const Default: Story = {}
