import type { Meta, StoryObj } from '@storybook/vue3-vite'
import LanguageMenu from './LanguageMenu.vue'

const meta: Meta<typeof LanguageMenu> = {
  title: 'LanguageMenu',
  component: LanguageMenu,
}
export default meta

type Story = StoryObj<typeof LanguageMenu>

export const Default: Story = {}
