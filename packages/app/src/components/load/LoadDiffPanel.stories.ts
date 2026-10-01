import type { Meta, StoryObj } from '@storybook/vue3-vite'
import LoadDiffPanel from './LoadDiffPanel.vue'

const meta: Meta<typeof LoadDiffPanel> = {
  title: 'Load/LoadDiffPanel',
  component: LoadDiffPanel,
}
export default meta

type Story = StoryObj<typeof LoadDiffPanel>

export const Default: Story = {}
