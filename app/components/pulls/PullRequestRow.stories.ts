import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { mockPullRequest, mockPullRequests } from '../../../test/fixtures/mock-pull-requests'
import PullRequestRow from './PullRequestRow.vue'

const meta: Meta<typeof PullRequestRow> = {
  title: 'Pulls/PullRequestRow',
  component: PullRequestRow,
  args: { owner: 'antfu', repo: 'pulls.review' },
}
export default meta

type Story = StoryObj<typeof PullRequestRow>

export const Full: Story = {
  args: { pr: mockPullRequests[0] },
}

export const Draft: Story = {
  args: { pr: mockPullRequests[1] },
}

/** What the anonymous REST path yields: no review decision, checks or linked issues. */
export const Minimal: Story = {
  args: { pr: mockPullRequest({ number: 7, title: 'fix: typo' }) },
}
