import type { Meta, StoryObj } from '@storybook/vue3-vite'
import nestedGroups from '../../../test/fixtures/synthetic/nested-groups.json'
import DiffGroupNav from './DiffGroupNav.vue'
import { resolveGroups } from './group-utils'

const groups = resolveGroups(nestedGroups.grouped.groups as any, nestedGroups.diff.files as any)

const meta: Meta<typeof DiffGroupNav> = {
  title: 'Diff/DiffGroupNav',
  component: DiffGroupNav,
  args: { groups, groupsVisable: [], reviewed: new Set() },
}
export default meta

type Story = StoryObj<typeof DiffGroupNav>

export const Default: Story = {}

export const OneGroupVisible: Story = {
  args: { groupsVisable: [groups[0]!.key] },
}

export const PartiallyReviewed: Story = {
  args: { reviewed: new Set(groups[0]!.files.map(file => file.sha)) },
}

export const SingleGroup: Story = {
  args: { groups: groups.slice(0, 1) },
}

export const WithDescription: Story = {
  args: { hasDescription: true, descriptionVisible: true },
}
