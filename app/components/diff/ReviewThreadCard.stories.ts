import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { mockMultiReplyThread, mockPendingThread, mockThread } from '../../../test/fixtures/mock-reviews'
import { createMockReviewsStore } from '../../stores/mock-diffs-store'
import ReviewThreadCard from './ReviewThreadCard.vue'

const botThread = mockThread({
  comments: [{
    id: 4130071743,
    author: {
      login: 'chatgpt-codex-connector[bot]',
      avatarUrl: 'https://avatars.githubusercontent.com/in/1144995?v=4',
    },
    body: '**<sub><sub>![P2 Badge](https://img.shields.io/badge/P2-yellow?style=flat)</sub></sub>  Exclude status capsules from ambient-light samples**\n\nWhen screen ambient light is enabled, these capsules paint over the captured stage. Their wrappers lack `stageOpaqueAttribute`, although `useStagePaintedMask` excludes only tagged overlays. The sampler then reads capsule colors as desktop colors and biases the character lighting while either status is visible. Mark both wrappers like `ControlsIsland`.\n\nUseful? React with 👍 / 👎.',
    createdAt: '2026-09-29T08:00:00Z',
    pending: false,
  }],
})

const meta: Meta<typeof ReviewThreadCard> = {
  title: 'Diff/ReviewThreadCard',
  component: ReviewThreadCard,
  args: {
    thread: mockThread(),
    reviews: createMockReviewsStore({ threads: [mockThread()] }),
  },
}
export default meta

type Story = StoryObj<typeof ReviewThreadCard>

export const SingleComment: Story = {}

export const MultiReply: Story = {
  args: { thread: mockMultiReplyThread() },
}

export const PendingDraft: Story = {
  args: { thread: mockPendingThread() },
}

export const Resolvable: Story = {
  args: { thread: mockThread({ threadId: 'PRRT_mock', resolved: false }) },
}

export const ReadOnly: Story = {
  args: { reviews: createMockReviewsStore({ canWrite: false }) },
}

export const BotReview: Story = {
  args: { thread: botThread },
}

export const BrokenAvatar: Story = {
  args: {
    thread: mockThread({
      comments: [{
        ...botThread.comments[0]!,
        author: { login: 'chatgpt-codex-connector[bot]', avatarUrl: 'data:image/png;base64,AAAA' },
      }],
    }),
  },
}
