import type { Meta, StoryObj } from '@storybook/vue3-vite'
import type { GroupedResult } from '../../types/analyze'
import empty from '../../../test/fixtures/synthetic/empty-group.json'
import { createMockDiffsStore } from '../../stores/mock-diffs-store'
import SharedAnalysisBanner from './SharedAnalysisBanner.vue'

const meta: Meta<typeof SharedAnalysisBanner> = {
  title: 'Diff/SharedAnalysisBanner',
  component: SharedAnalysisBanner,
}
export default meta

type Story = StoryObj<typeof SharedAnalysisBanner>

const result = { ...empty.grouped, source: 'llm', model: 'anthropic/claude-sonnet-4' } as GroupedResult

const candidates = [
  { login: 'antfu', url: 'https://github.com/owner/repo/pull/1#issuecomment-1', result, own: false, stale: false },
  { login: 'octocat', url: 'https://github.com/owner/repo/pull/1#issuecomment-2', result, own: true, stale: true },
  { login: 'posva', url: 'https://github.com/owner/repo/pull/1#issuecomment-3', result: { ...result, locale: 'ja' }, own: false, stale: false },
]

export const Candidates: Story = {
  args: { store: createMockDiffsStore({ diff: empty.diff as any, grouped: empty.grouped as any, shared: { candidates } }) },
}

export const ReplacesLocalResult: Story = {
  args: { store: createMockDiffsStore({ diff: empty.diff as any, grouped: result, shared: { candidates: candidates.slice(0, 1) } }) },
}

export const NotFound: Story = {
  args: { store: createMockDiffsStore({ diff: empty.diff as any, grouped: empty.grouped as any, shared: { notice: 'antfu has not shared an analysis of this pull request.' } }) },
}
