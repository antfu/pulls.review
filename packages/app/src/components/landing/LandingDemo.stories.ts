import type { Meta, StoryObj } from '@storybook/vue3-vite'
import LandingDemo from './LandingDemo.vue'

const meta: Meta<typeof LandingDemo> = {
  title: 'Landing/LandingDemo',
  component: LandingDemo,
  decorators: [() => ({ template: '<div class="max-w-lg"><story /></div>' })],
}
export default meta

type Story = StoryObj<typeof LandingDemo>

export const Default: Story = {}

export const ReducedMotion: Story = {
  args: { still: true },
}
