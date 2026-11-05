import { describe, expect, it } from 'vitest'
import {
  choiceDays,
  choiceOf,
  leavingLosesPlace,
  planDay,
  progressOf,
  resumableRun,
} from '@/features/routine/lib/readingPlanChoice'
import type { ReadingPlanRun } from '@/types/routine'

const run = (patch: Partial<ReadingPlanRun>): ReadingPlanRun => ({
  id: 'a',
  kind: 'canonical',
  startedOn: '2026-01-01',
  updatedAt: 1,
  ...patch,
})

describe('reading plan choice', () => {
  it('resumes the latest unfinished run of the same plan', () => {
    const runs = [
      run({ id: 'old', startedOn: '2025-01-01' }),
      run({ id: 'new', startedOn: '2026-01-01' }),
      run({ id: 'done', startedOn: '2026-06-01', finishedOn: '2026-12-01' }),
      run({ id: 'chrono', kind: 'chronological', startedOn: '2026-07-01' }),
    ]
    expect(resumableRun(runs, { kind: 'canonical' })?.id).toBe('new')
    expect(resumableRun(runs, { kind: 'chronological' })?.id).toBe('chrono')
    expect(resumableRun(runs, { kind: 'today' })).toBeNull()
  })

  it('resumes a custom plan only with the same book and pace', () => {
    const runs = [
      run({ id: 'c', kind: 'custom', startBook: 39, chaptersPerDay: 4 }),
    ]
    expect(
      resumableRun(runs, { kind: 'custom', startBook: 39, chaptersPerDay: 4 })
        ?.id
    ).toBe('c')
    expect(
      resumableRun(runs, { kind: 'custom', startBook: 39, chaptersPerDay: 3 })
    ).toBeNull()
  })

  it('reads a run back as a choice and counts its days', () => {
    expect(choiceOf(null)).toEqual({ kind: 'today' })
    expect(
      choiceOf(run({ kind: 'custom', startBook: 2, chaptersPerDay: 5 }))
    ).toEqual({ kind: 'custom', startBook: 2, chaptersPerDay: 5 })
    expect(choiceDays({ kind: 'canonical' })).toBe(365)
    expect(
      choiceDays({ kind: 'custom', startBook: 0, chaptersPerDay: 10 })
    ).toBe(119)
    expect(choiceDays({ kind: 'today' })).toBeNull()
  })

  it('asks before leaving a plan with progress', () => {
    const current = run({ id: 'a' })
    const progress = progressOf(current, [
      {
        id: 'bibleReading:2026-01-01',
        habit: 'bibleReading',
        on: '2026-01-01',
        run: 'a',
        portions: [0],
        updatedAt: 1,
      },
    ])
    expect(planDay(progress!)).toBe(2)
    expect(leavingLosesPlace(current, progress, { kind: 'today' })).toBe(true)
    expect(leavingLosesPlace(current, progress, { kind: 'canonical' })).toBe(
      false
    )
    expect(
      leavingLosesPlace(current, progressOf(current, []), { kind: 'today' })
    ).toBe(false)
  })
})
