import { describe, expect, it } from 'vitest'
import { planAgenda } from '@/features/routine/lib/planAgenda'
import { planPortionCount } from '@/lib/routine/readingPlans'
import type { ReadingPlanRun, RoutineEntry } from '@/types/routine'

const TODAY = '2026-11-09'
const run: ReadingPlanRun = {
  id: 'run',
  kind: 'canonical',
  startedOn: '2026-11-01',
  updatedAt: 1,
}
const reading = (on: string, portions: number[]): RoutineEntry => ({
  id: `bibleReading:${on}`,
  habit: 'bibleReading',
  on,
  run: 'run',
  portions,
  updatedAt: 1,
})
const indexes = (rows: ReturnType<typeof planAgenda>) =>
  rows.map((row) => row.portion.index)

describe('planAgenda', () => {
  it('starts at the first unread portion', () => {
    const rows = planAgenda(run, [reading('2026-11-01', [0, 1])], TODAY)
    expect(indexes(rows)).toEqual([2, 3, 4, 5, 6])
    expect(rows.map((row) => row.isNext)).toEqual([
      true,
      false,
      false,
      false,
      false,
    ])
  })

  it('lists what was read today first, then what comes after', () => {
    const rows = planAgenda(
      run,
      [reading('2026-11-01', [0]), reading(TODAY, [1, 2])],
      TODAY,
      2
    )
    expect(indexes(rows)).toEqual([1, 2, 3, 4])
    expect(rows.map((row) => row.readToday)).toEqual([true, true, false, false])
  })

  it('keeps a skipped portion next when a later one was read ahead', () => {
    const rows = planAgenda(run, [reading(TODAY, [2])], TODAY, 3)
    expect(indexes(rows)).toEqual([2, 0, 1, 3])
    expect(rows[1].isNext).toBe(true)
  })

  it('ignores another plan’s reading today and stops at the end', () => {
    const total = planPortionCount(run)
    const all = Array.from({ length: total - 1 }, (_, i) => i)
    const other = { ...reading(TODAY, [0]), run: 'other' }
    expect(indexes(planAgenda(run, [other], TODAY, 1))).toEqual([0])
    expect(
      indexes(planAgenda(run, [reading('2026-11-01', all)], TODAY))
    ).toEqual([total - 1])
  })
})
