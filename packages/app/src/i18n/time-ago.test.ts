import { describe, expect, it } from 'vitest'
import { formatTimeAgo } from './time-ago'

describe('formatTimeAgo', () => {
  const now = Date.UTC(2026, 0, 10, 12)

  it('picks the largest whole unit', () => {
    expect(formatTimeAgo(new Date(now - 3 * 60 * 60 * 1000), 'en', now)).toBe('3 hours ago')
    expect(formatTimeAgo(new Date(now - 2 * 24 * 60 * 60 * 1000), 'en', now)).toBe('2 days ago')
    expect(formatTimeAgo(new Date(now - 10_000), 'en', now)).toBe('now')
  })

  it('follows the locale', () => {
    expect(formatTimeAgo(new Date(now - 3 * 60 * 60 * 1000), 'zh-CN', now)).toBe('3小时前')
  })
})
