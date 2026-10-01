import type { Meta, StoryObj } from '@storybook/vue3-vite'
import SettingsModal from './SettingsModal.vue'

const meta: Meta<typeof SettingsModal> = {
  title: 'Settings/SettingsModal',
  component: SettingsModal,
}
export default meta

type Story = StoryObj<typeof SettingsModal>

export const Open: Story = {
  args: { open: true },
}

export const Closed: Story = {
  args: { open: false },
}
