import type { Meta, StoryObj } from '@storybook/vue3-vite'
import nestedGroups from '../../../test/fixtures/synthetic/nested-groups.json'
import DiffGroupSidebar from './DiffGroupSidebar.vue'
import { resolveGroups } from './group-utils'

const groups = resolveGroups(nestedGroups.grouped.groups as any, nestedGroups.diff.files as any)

const meta: Meta<typeof DiffGroupSidebar> = {
  title: 'Diff/DiffGroupSidebar',
  component: DiffGroupSidebar,
  args: { groups, groupsVisable: [], reviewed: new Set() },
  decorators: [() => ({ template: '<div class="w-64"><story /></div>' })],
}
export default meta

type Story = StoryObj<typeof DiffGroupSidebar>

export const Default: Story = {}

export const SubgroupVisible: Story = {
  args: { groupsVisable: [groups[0]!.children[0]!.key] },
}

export const PartiallyReviewed: Story = {
  args: { reviewed: new Set(groups[0]!.children[0]!.files.map(file => file.sha)) },
}

export const WithDescription: Story = {
  args: { hasDescription: true, descriptionVisible: true },
}
