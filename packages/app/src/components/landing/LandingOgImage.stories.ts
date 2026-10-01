import type { Meta, StoryObj } from '@storybook/vue3-vite'
import LandingOgImage from './LandingOgImage.vue'

const meta: Meta<typeof LandingOgImage> = {
  title: 'Landing/LandingOgImage',
  component: LandingOgImage,
  parameters: { layout: 'fullscreen' },
}
export default meta

type Story = StoryObj<typeof LandingOgImage>

/**
 * Screenshot `#og-image` from `?viewMode=story&id=landing-landingogimage--default`
 * to export the PNG.
 */
export const Default: Story = {}
