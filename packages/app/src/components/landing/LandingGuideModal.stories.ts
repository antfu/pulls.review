import type { Meta, StoryObj } from '@storybook/vue3-vite'
import LandingGuideModal from './LandingGuideModal.vue'

const meta: Meta<typeof LandingGuideModal> = {
  title: 'Landing/LandingGuideModal',
  component: LandingGuideModal,
}
export default meta

type Story = StoryObj<typeof LandingGuideModal>

export const Userscript: Story = {
  args: { guide: 'userscript' },
}

export const Actions: Story = {
  args: { guide: 'actions' },
}

export const Cli: Story = {
  args: { guide: 'cli' },
}
