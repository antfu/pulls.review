import type { DiffGroup, FileChange } from '@pulls.review/core/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import nestedGroups from '../../../test/fixtures/synthetic/nested-groups.json'
import { i18n } from '../../i18n'
import DiffGroupSidebar from './DiffGroupSidebar.vue'
import { resolveGroups } from './group-utils'

// Fixture: `docs` with subgroups `docs/featureA` and `docs/featureB`, plus flat groups.
const groups = resolveGroups(nestedGroups.grouped.groups as DiffGroup[], nestedGroups.diff.files as FileChange[])

function mountSidebar(groupsVisable: string[] = [], hasDescription = false) {
  return mount(DiffGroupSidebar, {
    props: { groups, groupsVisable, reviewed: new Set<string>(), hasDescription },
    global: { plugins: [i18n] },
  })
}

function labels(wrapper: ReturnType<typeof mountSidebar>) {
  return wrapper.findAll('span.truncate').map(el => el.text())
}

describe('diffGroupSidebar', () => {
  it('lists subgroups under their parent and collapses them on demand', async () => {
    const wrapper = mountSidebar()
    const parent = groups[0]!
    expect(labels(wrapper)).toEqual([parent.label, ...parent.children.map(child => child.label), ...groups.slice(1).map(group => group.label)])

    await wrapper.find('[aria-expanded="true"]').trigger('click')
    expect(labels(wrapper)).toEqual(groups.map(group => group.label))
  })

  it('emits the clicked group key', async () => {
    const wrapper = mountSidebar()
    const child = groups[0]!.children[0]!
    await wrapper.findAll('button').find(button => button.text().includes(child.label))!.trigger('click')
    expect(wrapper.emitted('select')).toEqual([[child.key]])
  })
  it('lists the description first and emits its selection', async () => {
    const wrapper = mountSidebar([], true)
    const first = wrapper.find('button')
    expect(first.text()).toBe('Description')
    await first.trigger('click')
    expect(wrapper.emitted('selectDescription')).toHaveLength(1)
  })
})
