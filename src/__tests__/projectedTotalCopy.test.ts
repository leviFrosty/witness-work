import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import {
  getPeriodTense,
  getStatusCopy,
  getStatusKey,
  segmentBoldMarkup,
} from '@/lib/projectedTotalCopy'
import type { ProjectedTotalState } from '@/lib/projectedTotal'
import enUS from '@/locales/en-US.json'

describe('getPeriodTense', () => {
  it('returns "present" when today falls inside the month scope', () => {
    expect(
      getPeriodTense(
        { kind: 'month', year: 2026, month: 4 },
        new Date('2026-05-15')
      )
    ).toBe('present')
  })

  it('returns "past" for a month scope already ended', () => {
    expect(
      getPeriodTense(
        { kind: 'month', year: 2026, month: 3 },
        new Date('2026-05-15')
      )
    ).toBe('past')
  })

  it('returns "future" for a month scope yet to begin', () => {
    expect(
      getPeriodTense(
        { kind: 'month', year: 2026, month: 7 },
        new Date('2026-05-15')
      )
    ).toBe('future')
  })

  it('treats today on the first day of the period as "present"', () => {
    expect(
      getPeriodTense(
        { kind: 'month', year: 2026, month: 4 },
        new Date(2026, 4, 1)
      )
    ).toBe('present')
  })

  it('returns "present" for a service-year scope spanning today', () => {
    expect(
      getPeriodTense(
        { kind: 'serviceYear', serviceYear: 2025 },
        new Date('2026-05-15')
      )
    ).toBe('present')
  })

  it('returns "past" for an earlier service year', () => {
    expect(
      getPeriodTense(
        { kind: 'serviceYear', serviceYear: 2023 },
        new Date('2026-05-15')
      )
    ).toBe('past')
  })
})

describe('getStatusKey', () => {
  it('returns present-tense key for current month + reachable_gap', () => {
    expect(getStatusKey('reachable_gap', 'present')).toBe(
      'projectedTotal.status.present.reachable_gap'
    )
  })

  it('returns past-tense key for an ended month + unreachable_gap', () => {
    expect(getStatusKey('unreachable_gap', 'past')).toBe(
      'projectedTotal.status.past.unreachable_gap'
    )
  })

  it('returns future-tense key for empty state on an upcoming month', () => {
    expect(getStatusKey('empty', 'future')).toBe(
      'projectedTotal.status.future.empty'
    )
  })

  it('falls back to present tense when a state+tense combo is unsupported', () => {
    expect(getStatusKey('reachable_gap', 'past')).toBe(
      'projectedTotal.status.present.reachable_gap'
    )
  })
})

describe('getStatusCopy', () => {
  const hours = (minutes: number) => `${minutes / 60}h`
  const projection = (
    state: ProjectedTotalState,
    loggedHours: number,
    plannedHours: number,
    goalHours = 50
  ) => ({
    state,
    loggedMinutes: loggedHours * 60,
    plannedMinutes: plannedHours * 60,
    projectedMinutes: (loggedHours + plannedHours) * 60,
    goalMinutes: goalHours * 60,
    gapMinutes: Math.max(0, goalHours - loggedHours - plannedHours) * 60,
  })
  const copy = (
    result: ReturnType<typeof projection>,
    tense: 'past' | 'present' | 'future' = 'present'
  ) => getStatusCopy(result, tense, 'this month', hours)

  it('counts only logged time as over goal, not plans', () => {
    expect(copy(projection('logged_over_goal', 52, 10))).toEqual({
      key: 'projectedTotal.status.present.logged_over_goal',
      params: {
        period: 'this month',
        projected: '62h',
        gap: '0h',
        over: '2h',
      },
    })
  })

  it('drops the plans sentence when nothing is planned', () => {
    expect(copy(projection('logged_over_goal', 52, 0))).toMatchObject({
      key: 'projectedTotal.status.present.logged_over_goal_no_plans',
      params: { over: '2h' },
    })
  })

  it('says the goal is reached when logged time lands exactly on it', () => {
    expect(copy(projection('logged_over_goal', 50, 10))?.key).toBe(
      'projectedTotal.status.present.logged_at_goal'
    )
    expect(copy(projection('logged_over_goal', 50, 0))?.key).toBe(
      'projectedTotal.status.present.logged_at_goal_no_plans'
    )
    expect(copy(projection('logged_over_goal', 50, 0), 'past')?.key).toBe(
      'projectedTotal.status.past.logged_at_goal'
    )
  })

  it('keeps the past-tense over-goal line for an ended period', () => {
    expect(copy(projection('logged_over_goal', 55, 0), 'past')).toMatchObject({
      key: 'projectedTotal.status.past.logged_over_goal',
      params: { over: '5h' },
    })
  })

  it('hides plan-based lines when nothing is planned', () => {
    expect(copy(projection('reachable_gap', 20, 0))).toBeNull()
    expect(copy(projection('unreachable_gap', 20, 0))).toBeNull()
  })

  it('narrates plans that reach the goal', () => {
    expect(copy(projection('projected_over_goal', 40, 15))).toMatchObject({
      key: 'projectedTotal.status.present.projected_over_goal',
      params: { projected: '55h' },
    })
  })

  it('resolves to keys that exist in en-US', () => {
    const cases = [
      copy(projection('logged_over_goal', 52, 10)),
      copy(projection('logged_over_goal', 52, 0)),
      copy(projection('logged_over_goal', 50, 10)),
      copy(projection('logged_over_goal', 50, 0)),
      copy(projection('logged_over_goal', 50, 0), 'past'),
      copy(projection('logged_over_goal', 55, 0), 'past'),
    ]
    for (const c of cases) {
      const value = c!.key
        .split('.')
        .reduce<unknown>(
          (node, part) => (node as Record<string, unknown>)?.[part],
          enUS
        )
      expect(typeof value, c!.key).toBe('string')
    }
  })
})

describe('segmentBoldMarkup', () => {
  it('returns a single non-bold segment when there is no markup', () => {
    expect(segmentBoldMarkup('No plans scheduled yet.')).toEqual([
      { text: 'No plans scheduled yet.', bold: false },
    ])
  })

  it('extracts bold ranges around plain text', () => {
    expect(
      segmentBoldMarkup('Planned hours put you at **42 hrs** — short.')
    ).toEqual([
      { text: 'Planned hours put you at ', bold: false },
      { text: '42 hrs', bold: true },
      { text: ' — short.', bold: false },
    ])
  })

  it('handles a string that starts and ends with bold segments', () => {
    expect(segmentBoldMarkup('**42 hrs** short of **50 hrs**')).toEqual([
      { text: '42 hrs', bold: true },
      { text: ' short of ', bold: false },
      { text: '50 hrs', bold: true },
    ])
  })
})
