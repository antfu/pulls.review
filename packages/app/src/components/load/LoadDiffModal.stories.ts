import type { Meta, StoryObj } from '@storybook/vue3-vite'
import LoadDiffModal from './LoadDiffModal.vue'

const meta: Meta<typeof LoadDiffModal> = {
  title: 'Load/LoadDiffModal',
  component: LoadDiffModal,
}
export default meta

type Story = StoryObj<typeof LoadDiffModal>

export const Open: Story = {
  args: { open: true },
}

export const Closed: Story = {
  args: { open: false },
}
