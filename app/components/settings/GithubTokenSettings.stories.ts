import type { Meta, StoryObj } from '@storybook/vue3-vite'
import GithubTokenSettings from './GithubTokenSettings.vue'

const meta: Meta<typeof GithubTokenSettings> = {
  title: 'Settings/GithubTokenSettings',
  component: GithubTokenSettings,
}
export default meta

type Story = StoryObj<typeof GithubTokenSettings>

const meta7Days = {
  login: 'octocat',
  avatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4',
  name: 'The Octocat',
  scopes: ['repo', 'read:org'],
  expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7,
  setAt: Date.now() - 1000 * 60 * 60 * 24 * 30,
}

export const NoToken: Story = {
  args: { tokenSet: false, meta: null },
}

export const ClassicToken: Story = {
  args: { tokenSet: true, meta: meta7Days },
}

export const FineGrainedNeverExpires: Story = {
  args: {
    tokenSet: true,
    meta: { ...meta7Days, scopes: [], expiresAt: null },
  },
}

export const Resolving: Story = {
  args: { tokenSet: true, meta: null, busy: true },
}

export const InvalidToken: Story = {
  args: {
    tokenSet: true,
    meta: null,
    error: 'GitHub rejected this token (401). Check that it was pasted completely and has not been revoked.',
  },
}
