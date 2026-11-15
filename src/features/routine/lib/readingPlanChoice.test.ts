import { describe, expect, it } from 'vitest'
import {
  choiceDays,
  choiceOf,
  DEFAULT_CUSTOM_CHOICE,
  isLastReading,
  leavingLosesPlace,
  planDay,
  progressOf,
  resumableRun,
  withBooks,
  type CustomPlanChoice,
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

  it('resumes a custom plan only with the same books and pace', () => {
    const runs = [
      run({
        id: 'c',
        kind: 'custom',
        startBook: 39,
        endBook: 65,
        chaptersPerDay: 4,
      }),
    ]
    const choice = (amount: CustomPlanChoice['amount']): CustomPlanChoice => ({
      kind: 'custom',
      startBook: 39,
      endBook: 65,
      amount,
    })
    expect(resumableRun(runs, choice({ unit: 'chapters', count: 4 }))?.id).toBe(
      'c'
    )
    expect(resumableRun(runs, choice({ unit: 'chapters', count: 3 }))).toBe(
      null
    )
    expect(resumableRun(runs, choice({ unit: 'verses', count: 4 }))).toBeNull()
  })

  it('reads a run back as a choice and counts its days', () => {
    expect(choiceOf(null)).toEqual({ kind: 'today' })
    expect(
      choiceOf(
        run({ kind: 'custom', startBook: 2, endBook: 4, versesPerDay: 5 })
      )
    ).toEqual({
      kind: 'custom',
      startBook: 2,
      endBook: 4,
      amount: { unit: 'verses', count: 5 },
    })
    expect(
      choiceOf(run({ kind: 'custom', startBook: 39, chaptersPerDay: 3 }))
    ).toMatchObject({ startBook: 39, endBook: 38 })
    expect(choiceDays({ kind: 'canonical' })).toBe(365)
    expect(
      choiceDays({
        ...DEFAULT_CUSTOM_CHOICE,
        amount: { unit: 'chapters', count: 10 },
      })
    ).toBe(119)
    expect(choiceDays({ kind: 'today' })).toBeNull()
  })

  it('keeps From at or before To', () => {
    const genesisToRuth = { ...DEFAULT_CUSTOM_CHOICE, endBook: 7 }
    expect(withBooks(genesisToRuth, { startBook: 10 })).toMatchObject({
      startBook: 10,
      endBook: 10,
    })
    expect(
      withBooks({ ...genesisToRuth, startBook: 5 }, { endBook: 2 })
    ).toMatchObject({ startBook: 2, endBook: 2 })
  })

  it('says when one reading is left', () => {
    const plan = run({
      kind: 'custom',
      startBook: 30,
      endBook: 30,
      chaptersPerDay: 1,
    })
    expect(isLastReading(progressOf(plan, [])!)).toBe(true)
    expect(isLastReading(progressOf(run({}), [])!)).toBe(false)
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
