/**
 * Beat sheet for the landing-page loop, as plain data so the choreography can be
 * read and tested without a DOM. `LandingDemo.vue` binds each beat to anime.js.
 */

export type DemoBeatName = 'flat' | 'morph' | 'grouped' | `review-${number}` | 'complete' | 'reset'

export interface DemoBeat {
  name: DemoBeatName
  /** Offset from the start of the loop, in ms. */
  at: number
  duration: number
}

export const BEAT_DURATIONS = {
  /** The flat file list holds still. */
  flat: 2000,
  /** File rows fly into their groups. */
  morph: 1200,
  /** Groups and summaries settle before reviewing starts. */
  grouped: 1000,
  /** One group's donut fills and flips to a check. */
  review: 700,
  /** Everything reviewed; the PR donut sits at 100%. */
  complete: 2000,
  /** Fade out before the loop restarts on the flat list. */
  reset: 500,
}

export function buildSchedule(groupCount: number): DemoBeat[] {
  const beats: DemoBeat[] = []
  let at = 0
  const push = (name: DemoBeatName, duration: number) => {
    beats.push({ name, at, duration })
    at += duration
  }
  push('flat', BEAT_DURATIONS.flat)
  push('morph', BEAT_DURATIONS.morph)
  push('grouped', BEAT_DURATIONS.grouped)
  for (let i = 0; i < groupCount; i++)
    push(`review-${i}`, BEAT_DURATIONS.review)
  push('complete', BEAT_DURATIONS.complete)
  push('reset', BEAT_DURATIONS.reset)
  return beats
}

export function findBeat(beats: DemoBeat[], name: DemoBeatName): DemoBeat {
  const beat = beats.find(b => b.name === name)
  if (!beat)
    throw new Error(`[LandingDemo] no beat named ${name}`)
  return beat
}

export function scheduleDuration(beats: DemoBeat[]): number {
  const last = beats.at(-1)
  return last ? last.at + last.duration : 0
}
