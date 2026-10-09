import type { Commit } from '@pulls.review/core/types'
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import DiffCommitSelector from './DiffCommitSelector.vue'

const now = Date.now()
const commits: Commit[] = [
  { sha: 'a1b2c3d4e5f6', message: 'feat: add the commit selector\n\nBody text.', author: { name: 'antfu', avatarUrl: 'https://github.com/antfu.png' }, date: new Date(now - 3 * 86_400_000).toISOString() },
  { sha: 'b2c3d4e5f6a1', message: 'fix: keep the dropdown within the viewport', author: { name: 'Someone Offline' }, date: new Date(now - 86_400_000).toISOString() },
  { sha: 'c3d4e5f6a1b2', message: 'chore: tidy up a very long commit subject that should be truncated inside the dropdown row rather than widening it', author: { name: 'antfu', avatarUrl: 'https://github.com/antfu.png' }, date: new Date(now - 3_600_000).toISOString() },
]

const meta: Meta<typeof DiffCommitSelector> = {
  title: 'Diff/DiffCommitSelector',
  component: DiffCommitSelector,
}
export default meta

type Story = StoryObj<typeof DiffCommitSelector>

export const AllChanges: Story = {
  args: { nav: { commits, select: () => {} } },
}

export const CommitSelected: Story = {
  args: { nav: { commits, selected: commits[1]!.sha, select: () => {} } },
}

export const UnknownCommit: Story = {
  args: { nav: { commits, selected: 'deadbeefcafe', select: () => {} } },
}
