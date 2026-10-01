import { describe, expect, it } from 'vitest'
import { BEAT_DURATIONS, buildSchedule, findBeat, scheduleDuration } from './demo-schedule'

describe('buildSchedule', () => {
  const beats = buildSchedule(5)

  it('tells the story in order: flat, morph, grouped, one review per group, complete, reset', () => {
    expect(beats.map(b => b.name)).toEqual([
      'flat',
      'morph',
      'grouped',
      'review-0',
      'review-1',
      'review-2',
      'review-3',
      'review-4',
      'complete',
      'reset',
    ])
  })

  it('leaves no gaps or overlaps between beats', () => {
    for (let i = 1; i < beats.length; i++)
      expect(beats[i]!.at).toBe(beats[i - 1]!.at + beats[i - 1]!.duration)
  })

  it('reviews groups one after another', () => {
    const first = findBeat(beats, 'review-0')
    const second = findBeat(beats, 'review-1')
    expect(second.at).toBe(first.at + BEAT_DURATIONS.review)
  })

  it('loops in roughly ten seconds', () => {
    const total = scheduleDuration(beats)
    expect(total).toBe(2000 + 1200 + 1000 + 5 * 700 + 2000 + 500)
    expect(total).toBeGreaterThan(9000)
    expect(total).toBeLessThan(12000)
  })

  it('throws on an unknown beat', () => {
    expect(() => findBeat(beats, 'review-9')).toThrow()
  })
})
