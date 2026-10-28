import { describe, expect, it } from 'vitest'
import type { TimeEntry } from '@/types/timeEntry'
import type { StreakHistory } from '@/lib/serviceStreak'
import {
  COINS_PER_DAY,
  COINS_PER_MILESTONE,
  COINS_PER_PLAN_KEPT,
  coinsOf,
  petDaysOut,
  petEarned,
  SHARED_MONTH_COINS,
  spentOn,
  walletGain,
  walletOf,
  type DaysOut,
} from '@/features/pet/lib/currency'

const entry = (day: string, patch: Partial<TimeEntry> = {}): TimeEntry => ({
  id: `${day}-${patch.hours ?? 1}`,
  hours: 1,
  minutes: 0,
  date: new Date(`${day}T12:00:00.000Z`),
  ...patch,
})

/** Days out, every one with a Time Entry unless listed in `visitsOnly`. */
const daysOut = (days: string[], visitsOnly: string[] = []): DaysOut => ({
  days: new Set([...days, ...visitsOnly]),
  entryDays: new Set(days),
})

/** Days `from` through `to` of October 2026. */
const october = (from: number, to: number) =>
  Array.from(
    { length: to - from + 1 },
    (_, i) => `2026-10-${String(from + i).padStart(2, '0')}`
  )

describe('petDaysOut', () => {
  it('counts Time Entries and the User’s own Visits, not rollovers or shared Contacts', () => {
    const { days, entryDays } = petDaysOut({
      serviceReports: {
        2026: {
          9: [
            entry('2026-10-02'),
            // The "shared" checkbox: a 0-minute entry.
            entry('2026-10-03', { hours: 0 }),
            entry('2026-10-04', { rollover: true }),
          ],
        },
      },
      visits: [
        { date: new Date(2026, 9, 5, 18) },
        { date: new Date(2026, 9, 6, 18), receivedAt: 1 },
      ],
    })
    expect([...days].sort()).toEqual(['2026-10-02', '2026-10-03', '2026-10-05'])
    expect([...entryDays].sort()).toEqual(['2026-10-02', '2026-10-03'])
  })
})

describe('petEarned', () => {
  const NO_HISTORY: StreakHistory = { kept: [], milestones: [] }
  const earned = ({
    days = [] as string[],
    visitsOnly = [] as string[],
    history = NO_HISTORY,
    streaks = true,
    adoptedOn = '2026-10-01',
    today = '2026-10-31',
    monthly = false,
  } = {}) =>
    petEarned({
      daysOut: daysOut(days, visitsOnly),
      history,
      streaks,
      adoptedOn,
      today,
      paceOf: () => (monthly ? 'monthly' : 'daily'),
    })

  it('pays a coin a day out, one more a planned day kept, ten a milestone', () => {
    expect([
      COINS_PER_DAY,
      COINS_PER_PLAN_KEPT,
      COINS_PER_MILESTONE,
      SHARED_MONTH_COINS,
    ]).toEqual([1, 1, 10, 8])
    expect(coinsOf(earned())).toBe(0)
    const week = earned({
      days: october(5, 9),
      history: {
        kept: ['2026-10-05', '2026-10-07', '2026-10-09'],
        milestones: [{ count: 3, on: '2026-10-09' }],
      },
    })
    expect(week).toMatchObject({ daysOut: 5, plansKept: 3, shared: 0 })
    expect(coinsOf(week)).toBe(5 + 3 + 10)
  })

  it('counts a Visit as a day out', () => {
    expect(
      earned({ days: ['2026-10-02'], visitsOnly: ['2026-10-03'] })
    ).toMatchObject({ daysOut: 2 })
  })

  it('pays milestones only while streaks show', () => {
    const history: StreakHistory = {
      kept: ['2026-10-05'],
      milestones: [{ count: 3, on: '2026-10-05' }],
    }
    expect(
      earned({ days: ['2026-10-05'], history, streaks: false })
    ).toMatchObject({ plansKept: 1, milestones: [] })
  })

  it('counts only what happened from adoption through today', () => {
    const history: StreakHistory = {
      kept: ['2026-10-02', '2026-10-06', '2026-10-20'],
      milestones: [
        { count: 3, on: '2026-10-02' },
        { count: 5, on: '2026-10-20' },
      ],
    }
    const days = ['2026-10-02', '2026-10-06', '2026-10-20']
    expect(
      earned({ days, history, adoptedOn: '2026-10-05', today: '2026-10-10' })
    ).toMatchObject({
      daysOut: 1,
      plansKept: 1,
      milestones: [],
    })
    expect(earned({ days, history, adoptedOn: '2026-10-05' })).toMatchObject({
      daysOut: 2,
      plansKept: 2,
      milestones: [{ count: 5, on: '2026-10-20' }],
    })
  })

  it('pays a monthly-pace month with a Time Entry at least 8 for its days out', () => {
    const one = earned({ days: ['2026-10-20'], monthly: true })
    expect(one).toMatchObject({ daysOut: 1, shared: 7 })
    expect(coinsOf(one)).toBe(8)
    expect(coinsOf(earned({ days: ['2026-10-20'] }))).toBe(1)
    // A Visit alone isn't a report.
    expect(coinsOf(earned({ visitsOnly: ['2026-10-20'], monthly: true }))).toBe(
      1
    )
    // A check before the adoption day counts for that month's least, not as a
    // day out; a month before adoption earns nothing.
    const before = { days: ['2026-10-03'], adoptedOn: '2026-10-10' }
    expect(coinsOf(earned({ ...before, monthly: true }))).toBe(8)
    expect(coinsOf(earned(before))).toBe(0)
    expect(
      coinsOf(
        earned({ days: ['2026-09-20'], adoptedOn: '2026-10-10', monthly: true })
      )
    ).toBe(0)
    // More days out count once they earn more than that.
    expect(coinsOf(earned({ days: october(1, 31), monthly: true }))).toBe(31)
  })

  it('adds a planned day kept and a milestone on top of the monthly least', () => {
    const month = earned({
      days: ['2026-10-20'],
      monthly: true,
      history: {
        kept: ['2026-10-20'],
        milestones: [{ count: 4, on: '2026-10-20' }],
      },
    })
    expect(coinsOf(month)).toBe(8 + 1 + 10)
  })
})

describe('the wallet', () => {
  it('adds up what purchases cost', () => {
    expect(spentOn(undefined)).toBe(0)
    expect(
      spentOn([
        { item: 'hat:bow', price: 10, on: '2026-10-01' },
        { item: 'hat:cap', price: 12, on: '2026-10-02' },
        { item: 'hat:tophat', price: 36, on: '2026-10-03' },
      ])
    ).toBe(58)
  })

  it('leaves earned minus spent, never below 0', () => {
    expect(walletOf(20, 11)).toBe(9)
    // Two devices bought offline and overspent.
    expect(walletOf(10, 14)).toBe(0)
  })

  it('gains only what went up', () => {
    expect(walletGain(9, 12)).toBe(3)
    expect(walletGain(12, 9)).toBe(0)
  })
})
