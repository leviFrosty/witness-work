import { describe, expect, it } from 'vitest'
import {
  bestIndex,
  chartHours,
  liftIntensity,
  liftScale,
  MIN_BUCKET_VISITS,
  slotLift,
  territoryInsights as insightsOf,
  visitWeight,
} from '@/features/territories/lib/insights'
import {
  cellKey,
  MIN_INSIGHT_VISITS,
  monthOf,
  type VisitCell,
} from '@/features/territories/lib/visitTally'

const SATURDAY = 6
const TUESDAY = 2
const NOW = new Date(2026, 10, 13, 12).getTime()
const THIS_MONTH = monthOf(NOW)

const cells = (
  entries: [day: number, hour: number, cell: VisitCell][],
  month = THIS_MONTH
) =>
  Object.fromEntries(
    entries.map(([day, hour, cell]) => [cellKey(day, hour, month), cell])
  )

const territoryInsights = (tally: { cells: Record<string, VisitCell> }) =>
  insightsOf([tally], { now: NOW })

const b = (spoke: number, notHome: number) => ({
  spoke,
  notHome,
  total: spoke + notHome,
  rate: spoke / (spoke + notHome || 1),
  weightedSpoke: spoke,
  weightedTotal: spoke + notHome,
})

describe('territoryInsights', () => {
  it('says to check back later until there are enough visits', () => {
    const insights = territoryInsights({
      cells: cells([[SATURDAY, 10, [4, 2]]]),
    })
    expect(insights.ready).toBe(false)
    expect(insights.total).toBe(6)
    expect(insights.remaining).toBe(MIN_INSIGHT_VISITS - 6)
  })

  it('finds the best day, hour and slot by answer rate', () => {
    const insights = territoryInsights({
      cells: cells([
        [SATURDAY, 10, [12, 4]],
        [SATURDAY, 14, [3, 5]],
        [TUESDAY, 10, [2, 8]],
        [TUESDAY, 14, [1, 9]],
      ]),
    })
    expect(insights.ready).toBe(true)
    expect(insights.total).toBe(44)
    expect(insights.rate).toBeCloseTo(18 / 44)
    expect(insights.bestDay).toBe(SATURDAY)
    expect(insights.bestHour).toBe(10)
    expect(insights.bestSlot).toEqual({ day: SATURDAY, hour: 10 })
    expect(insights.worstDay).toBe(TUESDAY)
    expect(insights.worstHour).toBe(14)
    expect(insights.worstSlot).toEqual({ day: TUESDAY, hour: 14 })
    expect(insights.byDay[SATURDAY]).toMatchObject({ spoke: 15, notHome: 9 })
    expect(insights.byHour[14]).toMatchObject({ spoke: 4, notHome: 14 })
  })

  it('names no weakest time when everything answers alike', () => {
    const insights = territoryInsights({
      cells: cells([
        [SATURDAY, 10, [20, 20]],
        [TUESDAY, 10, [10, 10]],
      ]),
    })
    expect(insights.worstDay).toBeUndefined()
    expect(insights.worstHour).toBeUndefined()
  })

  it('never picks a best from too few visits', () => {
    const insights = territoryInsights({
      cells: cells([
        [SATURDAY, 7, [2, 0]],
        [TUESDAY, 10, [20, 20]],
      ]),
    })
    expect(insights.bestHour).toBe(10)
    expect(insights.bestDay).toBe(TUESDAY)
    expect(insights.bestSlot).toEqual({ day: TUESDAY, hour: 10 })
  })
})

describe('weighting', () => {
  it('halves a month every six months, never below a fifth', () => {
    expect(visitWeight(THIS_MONTH, THIS_MONTH)).toBe(1)
    expect(visitWeight(THIS_MONTH - 6, THIS_MONTH)).toBeCloseTo(0.5)
    expect(visitWeight(THIS_MONTH - 45, THIS_MONTH)).toBe(0.2)
  })

  it('counts the same season in earlier years extra', () => {
    expect(visitWeight(THIS_MONTH - 12, THIS_MONTH)).toBe(0.6)
    expect(visitWeight(THIS_MONTH - 13, THIS_MONTH)).toBe(0.6)
    expect(visitWeight(THIS_MONTH - 18, THIS_MONTH)).toBe(0.2)
    expect(visitWeight(THIS_MONTH - 24, THIS_MONTH)).toBe(0.6)
  })

  it('leans on recent months without losing older ones', () => {
    const insights = insightsOf(
      [
        { cells: cells([[SATURDAY, 10, [0, 20]]], THIS_MONTH - 33) },
        { cells: cells([[SATURDAY, 10, [10, 10]]]) },
      ],
      { now: NOW }
    )
    expect(insights.total).toBe(40)
    expect(insights.byDay[SATURDAY]).toMatchObject({ spoke: 10, notHome: 30 })
    expect(insights.rate).toBeCloseTo(10 / (20 + 20 * 0.2))
    expect(insights.leansOnPast).toBe(false)
  })

  it('says when most visits are older than 3 months', () => {
    const insights = insightsOf(
      [{ cells: cells([[SATURDAY, 10, [10, 30]]], THIS_MONTH - 5) }],
      { now: NOW }
    )
    expect(insights.ready).toBe(true)
    expect(insights.leansOnPast).toBe(true)
  })
})

describe('pooling territories', () => {
  it('adds up every territory, and each stays on its own', () => {
    const north = { cells: cells([[SATURDAY, 10, [20, 5]]]) }
    const south = { cells: cells([[TUESDAY, 14, [5, 20]]]) }
    const all = insightsOf([north, south], { now: NOW })
    expect(all.total).toBe(50)
    expect(all.ready).toBe(true)
    const one = insightsOf([south], { now: NOW })
    expect(one.total).toBe(25)
    expect(one.ready).toBe(false)
  })
})

describe('bestIndex', () => {
  it('breaks a tie with the bucket that has more visits', () => {
    expect(bestIndex([b(3, 3), b(6, 6)], MIN_BUCKET_VISITS)).toBe(1)
  })

  it('has no best without enough visits', () => {
    expect(bestIndex([b(1, 1), b(2, 0)], MIN_BUCKET_VISITS)).toBeUndefined()
  })
})

describe('chartHours', () => {
  const hours = (used: number[]) =>
    Array.from({ length: 24 }, (_, hour) => ({
      spoke: used.includes(hour) ? 1 : 0,
      notHome: 0,
      total: used.includes(hour) ? 1 : 0,
      rate: 1,
      weightedSpoke: 0,
      weightedTotal: 0,
    }))

  it('spans the hours with visits', () => {
    expect(chartHours(hours([8, 9, 12, 19]))).toEqual([8, 19])
  })

  it('widens a short span so the chart keeps its shape', () => {
    expect(chartHours(hours([10, 11]))).toEqual([7, 14])
    expect(chartHours(hours([0]))).toEqual([0, 7])
    expect(chartHours(hours([23]))).toEqual([16, 23])
  })

  it('shows the working day when there is nothing yet', () => {
    expect(chartHours(hours([]))).toEqual([9, 17])
  })
})

describe('slotLift', () => {
  it('compares a day and hour with the average answer rate', () => {
    expect(slotLift(b(3, 1), 0.5)).toBeCloseTo(0.25)
    expect(slotLift(b(1, 3), 0.5)).toBeCloseTo(-0.25)
  })

  it('has no difference without enough doors', () => {
    expect(slotLift(b(2, 0), 0.5)).toBeUndefined()
    expect(slotLift(undefined, 0.5)).toBeUndefined()
  })

  it('scales each side to its largest difference, never below 10 points', () => {
    const scale = liftScale([[b(4, 0), b(0, 4), b(2, 0)]], 0.4)
    expect(scale.above).toBeCloseTo(0.6)
    expect(scale.below).toBeCloseTo(0.4)
    expect(liftScale([[b(2, 2)]], 0.5)).toEqual({ above: 0.1, below: 0.1 })
  })
})

describe('liftIntensity', () => {
  it('saves strong color for the biggest differences', () => {
    const scale = { above: 0.22, below: 0.35 }
    expect(liftIntensity(0.22, scale)).toBe(1)
    expect(liftIntensity(-0.35, scale)).toBe(1)
    expect(liftIntensity(-0.22, scale)).toBeLessThan(0.5)
    expect(liftIntensity(0.14, scale)).toBeLessThan(0.5)
    expect(liftIntensity(0.05, scale)).toBeLessThan(0.1)
  })
})
