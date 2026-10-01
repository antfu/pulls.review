import type { Meta, StoryObj } from '@storybook/vue3-vite'
import LandingHero from './LandingHero.vue'

const meta: Meta<typeof LandingHero> = {
  title: 'Landing/LandingHero',
  component: LandingHero,
}
export default meta

type Story = StoryObj<typeof LandingHero>

export const Default: Story = {}
