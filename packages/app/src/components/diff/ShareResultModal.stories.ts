import type { GroupedResult } from '@pulls.review/core/types'
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import nested from '../../../test/fixtures/synthetic/nested-groups.json'
import { createMockDiffsStore } from '../../stores/mock-diffs-store'
import ShareResultModal from './ShareResultModal.vue'

const meta: Meta<typeof ShareResultModal> = {
  title: 'Diff/ShareResultModal',
  component: ShareResultModal,
  args: { open: true },
}
export default meta

type Story = StoryObj<typeof ShareResultModal>

const grouped = { ...nested.grouped, source: 'llm', model: 'anthropic/claude-sonnet-4', locale: 'en' } as GroupedResult

export const FirstShare: Story = {
  args: { store: createMockDiffsStore({ diff: nested.diff as any, grouped, shared: {} }) },
}

export const UpdateExisting: Story = {
  args: { store: createMockDiffsStore({ diff: nested.diff as any, grouped, shared: { ownComment: { id: 1, url: 'https://github.com/owner/repo/pull/1#issuecomment-1' } } }) },
}

export const NotEnglish: Story = {
  args: { store: createMockDiffsStore({ diff: nested.diff as any, grouped: { ...grouped, locale: 'zh-CN' }, shared: {} }) },
}

export const Failed: Story = {
  args: { store: createMockDiffsStore({ diff: nested.diff as any, grouped, shared: { error: new Error('Resource not accessible by personal access token') } }) },
}
