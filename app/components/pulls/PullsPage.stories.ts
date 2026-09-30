import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { createMockPullRequestListStore } from '../../../test/fixtures/mock-pull-requests'
import PullsPage from './PullsPage.vue'

const meta: Meta<typeof PullsPage> = {
  title: 'Pulls/PullsPage',
  component: PullsPage,
  parameters: { layout: 'fullscreen' },
}
export default meta

type Story = StoryObj<typeof PullsPage>

export const Default: Story = {
  args: { store: createMockPullRequestListStore() },
}

export const Loading: Story = {
  args: { store: createMockPullRequestListStore({ items: [], totalCount: undefined, isLoading: true }) },
}

export const LoadingMore: Story = {
  args: { store: createMockPullRequestListStore({ hasMore: true, isLoadingMore: true, totalCount: 120 }) },
}

export const Empty: Story = {
  args: { store: createMockPullRequestListStore({ items: [], totalCount: 0 }) },
}

export const LoadFailed: Story = {
  args: { store: createMockPullRequestListStore({ items: [], totalCount: undefined, error: new Error('GitHub API request failed (403): rate limit exceeded') }) },
}
