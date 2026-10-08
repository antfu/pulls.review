import type { Meta, StoryObj } from '@storybook/vue3-vite'
import RepositoryPill from './RepositoryPill.vue'

const meta: Meta<typeof RepositoryPill> = {
  title: 'RepositoryPill',
  component: RepositoryPill,
  args: { repository: { kind: 'github-repo', owner: 'antfu', repo: 'pulls.review' } },
}
export default meta

type Story = StoryObj<typeof RepositoryPill>

export const Default: Story = {}

export const GitlabProject: Story = {
  args: { repository: { kind: 'gitlab-project', host: 'gitlab.com', project: 'gitlab-org/ci-cd/runner' } },
}
