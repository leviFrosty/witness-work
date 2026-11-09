import { describe, expect, it } from 'vitest'
import { defaultFinishBy, planPace } from '@/features/routine/lib/planPace'
import type { PlanProgress } from '@/lib/routine/readingPlans'

const TODAY = '2026-11-09'
const progress = (read: number, total = 365): PlanProgress => ({
  read,
  total,
  next: null,
  finished: read >= total,
})

describe('planPace', () => {
  it('estimates the finish at a reading a day when no date is set', () => {
    expect(planPace({}, progress(0, 10), TODAY, false)).toEqual({
      kind: 'estimate',
      finishOn: '2026-11-18',
    })
    expect(planPace({}, progress(1, 10), TODAY, true)).toEqual({
      kind: 'estimate',
      finishOn: '2026-11-18',
    })
  })

  it('is on pace when a reading a day reaches the finish date', () => {
    const run = { finishBy: '2026-11-18' }
    expect(planPace(run, progress(0, 10), TODAY, false)).toEqual({
      kind: 'onPace',
    })
    expect(planPace(run, progress(1, 10), TODAY, true)).toEqual({
      kind: 'onPace',
    })
  })

  it('says how many readings a day a closer date takes', () => {
    expect(
      planPace({ finishBy: '2026-11-13' }, progress(0, 10), TODAY, false)
    ).toEqual({ kind: 'faster', perDay: 2, extra: 5 })
    expect(planPace({ finishBy: TODAY }, progress(7, 10), TODAY, true)).toEqual(
      { kind: 'faster', perDay: 3, extra: 2 }
    )
  })

  it('reports a date that has passed, and nothing once finished', () => {
    expect(
      planPace({ finishBy: '2026-11-08' }, progress(0, 10), TODAY, false)
    ).toEqual({ kind: 'passed' })
    expect(planPace({}, progress(10, 10), TODAY, true)).toBeNull()
  })
})

describe('defaultFinishBy', () => {
  it('offers the plan’s own length from its start date', () => {
    expect(
      defaultFinishBy({ startedOn: '2026-01-01' }, progress(100), TODAY, false)
    ).toBe('2026-12-31')
  })

  it('falls back to a reading a day from today once that has passed', () => {
    expect(
      defaultFinishBy(
        { startedOn: '2025-01-01' },
        progress(5, 10),
        TODAY,
        false
      )
    ).toBe('2026-11-13')
  })
})
