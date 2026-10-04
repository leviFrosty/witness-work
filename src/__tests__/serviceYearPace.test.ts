import { describe, expect, it } from 'vitest'
import {
  buildServiceYearPace,
  paceScale,
} from '@/features/progress/lib/serviceYearPace'
import { serviceYearMonths } from '@/lib/roleHistory'

const H = 60

/** Twelve projection months for Service Year 2025, September first. */
const projected = (logged: number[], planned: number[] = []) =>
  serviceYearMonths(2025).map((m, i) => ({
    ...m,
    loggedMinutes: (logged[i] ?? 0) * H,
    projectedMinutes: ((logged[i] ?? 0) + (planned[i] ?? 0)) * H,
  }))

const pioneerGoal = Array(12).fill(50 * H)

describe('buildServiceYearPace', () => {
  it('runs logged time up to today and Plans from today on', () => {
    // Today: Nov 16, 2025 — the third month of Service Year 2025.
    const pace = buildServiceYearPace({
      serviceYear: 2025,
      today: new Date(2025, 10, 16),
      goalMinutesByMonth: pioneerGoal,
      months: projected([52, 48, 20], [0, 0, 25, 50]),
    })

    expect(pace.tense).toBe('present')
    const today = pace.points.find((p) => p.kind === 'today')
    expect(today?.x).toBeCloseTo(2 + 15.5 / 30)
    expect(today?.logged).toBe(120 * H)
    expect(today?.planned).toBe(120 * H)

    const monthEnds = pace.points.filter((p) => p.kind === 'monthEnd')
    expect(monthEnds.map((p) => p.logged)).toEqual([
      52 * H,
      100 * H,
      ...Array(10).fill(null),
    ])
    expect(monthEnds[2].planned).toBe(145 * H)
    expect(monthEnds[3].planned).toBe(195 * H)
    expect(monthEnds[1].planned).toBeNull()

    expect(pace.loggedMinutes).toBe(120 * H)
    expect(pace.projectedMinutes).toBe(195 * H)
    // Two full months of goal plus 15.5 of November's 30 days.
    expect(pace.goalToDateMinutes).toBeCloseTo((100 + 50 * (15.5 / 30)) * H)
  })

  it('steps the goal line by each month’s own share', () => {
    const shares = [0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50].map((h) => h * H)
    const pace = buildServiceYearPace({
      serviceYear: 2025,
      today: new Date(2026, 9, 1),
      goalMinutesByMonth: shares,
      months: projected([]),
    })

    const goals = pace.points.map((p) => p.goal / H)
    expect(goals).toEqual([0, 0, 0, 0, 0, 0, 0, 50, 100, 150, 200, 250, 300])
    expect(pace.goalMinutes).toBe(300 * H)
  })

  it('draws a finished year as logged only, measured against the whole goal', () => {
    const pace = buildServiceYearPace({
      serviceYear: 2025,
      today: new Date(2026, 9, 1),
      goalMinutesByMonth: pioneerGoal,
      months: projected(Array(12).fill(51)),
    })

    expect(pace.tense).toBe('past')
    expect(pace.points.some((p) => p.kind === 'today')).toBe(false)
    expect(pace.points.every((p) => p.planned === null)).toBe(true)
    expect(pace.points.at(-1)?.logged).toBe(612 * H)
    expect(pace.goalToDateMinutes).toBe(600 * H)
  })

  it('draws a year that has not started as Plans only', () => {
    const pace = buildServiceYearPace({
      serviceYear: 2025,
      today: new Date(2025, 6, 1),
      goalMinutesByMonth: pioneerGoal,
      months: projected([], [10]),
    })

    expect(pace.tense).toBe('future')
    expect(pace.points.every((p) => p.logged === null)).toBe(true)
    expect(pace.points[0].planned).toBe(0)
    expect(pace.points.at(-1)?.planned).toBe(10 * H)
    expect(pace.goalToDateMinutes).toBe(0)
  })

  it('leaves Plans out when nothing is planned', () => {
    const pace = buildServiceYearPace({
      serviceYear: 2025,
      today: new Date(2025, 10, 16),
      goalMinutesByMonth: pioneerGoal,
      months: projected([52, 48, 20]),
    })

    expect(pace.points.every((p) => p.planned === null)).toBe(true)
  })

  it('compares with last year at the same point when last year has time', () => {
    const pace = buildServiceYearPace({
      serviceYear: 2025,
      today: new Date(2025, 10, 16),
      goalMinutesByMonth: pioneerGoal,
      months: projected([52, 48, 20]),
      lastYearLoggedByMonth: Array(12).fill(30 * H),
    })

    expect(pace.hasLastYear).toBe(true)
    expect(pace.points.at(-1)?.lastYear).toBe(360 * H)
    expect(pace.lastYearToDateMinutes).toBeCloseTo((60 + 30 * (15.5 / 30)) * H)
    expect(pace.maxMinutes).toBe(600 * H)
  })

  it('hides last year when it has no time', () => {
    const pace = buildServiceYearPace({
      serviceYear: 2025,
      today: new Date(2025, 10, 16),
      goalMinutesByMonth: pioneerGoal,
      months: projected([52]),
      lastYearLoggedByMonth: Array(12).fill(0),
    })

    expect(pace.hasLastYear).toBe(false)
    expect(pace.lastYearToDateMinutes).toBeNull()
    expect(pace.points.every((p) => p.lastYear === null)).toBe(true)
  })
})

describe('paceScale', () => {
  const goal = 600 * H

  it('stays linear when nothing runs far past the goal', () => {
    const scale = paceScale(goal, 700 * H)
    expect(scale.compressed).toBe(false)
    expect(scale.toChart(650 * H)).toBe(650 * H)
    expect(scale.top).toBe(700 * H)
  })

  it('compresses totals above the goal into the top fifth', () => {
    const scale = paceScale(goal, 900 * H)
    expect(scale.compressed).toBe(true)
    // The goal sits at 80% of the height; the highest total at the top.
    expect(scale.toChart(goal) / scale.top).toBeCloseTo(0.8)
    expect(scale.toChart(900 * H)).toBeCloseTo(scale.top)
    // Below the goal, totals keep their true proportions.
    expect(scale.toChart(300 * H)).toBe(300 * H)
    // Above it, equal steps take less and less room.
    const first = scale.toChart(700 * H) - scale.toChart(600 * H)
    const last = scale.toChart(900 * H) - scale.toChart(800 * H)
    expect(last).toBeLessThan(first)
  })

  it('is linear when there is no goal', () => {
    const scale = paceScale(0, 400 * H)
    expect(scale.compressed).toBe(false)
    expect(scale.toChart(400 * H)).toBe(400 * H)
  })
})
