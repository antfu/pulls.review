import type { Meta, StoryObj } from '@storybook/vue3-vite'
import GithubAccountSettings from './GithubAccountSettings.vue'

const meta: Meta<typeof GithubAccountSettings> = {
  title: 'Settings/GithubAccountSettings',
  component: GithubAccountSettings,
}
export default meta

type Story = StoryObj<typeof GithubAccountSettings>

export const SignedOut: Story = {
  args: { account: null, oauthAvailable: true },
}

export const SignedInViaApp: Story = {
  args: {
    account: {
      id: 583231,
      login: 'octocat',
      avatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4',
      name: 'The Octocat',
    },
    oauthAvailable: true,
  },
}

export const EmbeddedAnonymous: Story = {
  args: { account: null, oauthAvailable: false },
}
