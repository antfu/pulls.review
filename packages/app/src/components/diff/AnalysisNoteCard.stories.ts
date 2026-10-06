import type { Meta, StoryObj } from '@storybook/vue3-vite'
import AnalysisNoteCard from './AnalysisNoteCard.vue'

const meta: Meta<typeof AnalysisNoteCard> = {
  title: 'Diff/AnalysisNoteCard',
  component: AnalysisNoteCard,
  args: {
    note: { text: 'The retry loop now swallows `AbortError`, so a cancelled request looks like a successful one to the caller.', critical: false },
  },
}
export default meta

type Story = StoryObj<typeof AnalysisNoteCard>

export const Default: Story = {}

export const Critical: Story = {
  args: {
    note: { text: 'Drops the uniqueness constraint before backfilling; a crash between the two migrations leaves duplicates behind.', critical: true },
  },
}

export const Markdown: Story = {
  args: {
    note: {
      text: 'Order matters here:\n\n1. `flush()` writes the buffer\n2. `close()` releases the handle\n\nSwapping them loses the last chunk - see [the upstream issue](https://example.com).',
      critical: false,
    },
  },
}
