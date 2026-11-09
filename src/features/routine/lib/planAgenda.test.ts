import { describe, expect, it } from 'vitest'
import {
  planAgenda,
  planCompleted,
  readPlanToday,
} from '@/features/routine/lib/planAgenda'
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
    const rows = planAgenda(run, [reading('2026-11-01', [0, 1])])
    expect(indexes(rows)).toEqual([2, 3, 4, 5, 6])
    expect(rows.map((row) => row.isNext)).toEqual([
      true,
      false,
      false,
      false,
      false,
    ])
  })

  it('leaves out what was read, today included', () => {
    const rows = planAgenda(
      run,
      [reading('2026-11-01', [0]), reading(TODAY, [1, 2])],
      2
    )
    expect(indexes(rows)).toEqual([3, 4])
  })

  it('keeps a skipped portion next when a later one was read ahead', () => {
    const rows = planAgenda(run, [reading(TODAY, [2])], 3)
    expect(indexes(rows)).toEqual([0, 1, 3])
    expect(rows[0].isNext).toBe(true)
  })

  it('ignores another plan’s reading and stops at the end', () => {
    const total = planPortionCount(run)
    const all = Array.from({ length: total - 1 }, (_, i) => i)
    const other = { ...reading(TODAY, [0]), run: 'other' }
    expect(indexes(planAgenda(run, [other], 1))).toEqual([0])
    expect(indexes(planAgenda(run, [reading('2026-11-01', all)]))).toEqual([
      total - 1,
    ])
  })
})

describe('planCompleted', () => {
  it('lists every portion read, newest day and latest portion first', () => {
    const other = { ...reading('2026-11-05', [9]), run: 'other' }
    const rows = planCompleted(run, [
      reading('2026-11-01', [0, 1]),
      other,
      reading(TODAY, [2, 4]),
    ])
    expect(rows.map((row) => [row.portion.index, row.on])).toEqual([
      [4, TODAY],
      [2, TODAY],
      [1, '2026-11-01'],
      [0, '2026-11-01'],
    ])
  })
})

describe('readPlanToday', () => {
  it('is true only for this plan’s portions read today', () => {
    expect(readPlanToday(run, [reading('2026-11-08', [0])], TODAY)).toBe(false)
    expect(
      readPlanToday(run, [{ ...reading(TODAY, [0]), run: 'other' }], TODAY)
    ).toBe(false)
    expect(readPlanToday(run, [reading(TODAY, [0])], TODAY)).toBe(true)
  })
})
