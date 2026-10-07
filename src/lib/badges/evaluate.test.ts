import { describe, expect, it, vi } from 'vitest'
import {
  BadgeEvaluationInput,
  evaluateBadges,
  newlyEarnedBadges,
  sharedMonths,
} from '@/lib/badges/evaluate'
import { ALL_BADGE_KEYS, parseBadgeKey } from '@/lib/badges/catalog'
import {
  buddyCardBadges,
  knownSharedBadges,
  profileBadges,
} from '@/lib/badges/display'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import {
  RecurringPlanFrequencies,
  TimeEntriesByYear,
  TimeEntry,
} from '@/types/timeEntry'
import { Visit } from '@/types/visit'

vi.mock('@/lib/locales', () => ({
  default: { t: (key: string) => key },
}))

const NOW = new Date(2026, 9, 15, 12) // 15 Oct 2026, local noon

const entry = (
  year: number,
  month: number,
  day: number,
  minutes: number,
  extra: Partial<TimeEntry> = {}
): TimeEntry => ({
  id: `e-${year}-${month}-${day}-${minutes}-${extra.rollover ? 'r' : ''}`,
  hours: Math.trunc(minutes / 60),
  minutes: minutes % 60,
  date: normalizeDateForStorage(new Date(year, month, day, 12)),
  ...extra,
})

const reportsFrom = (entries: TimeEntry[]): TimeEntriesByYear => {
  const byYear: TimeEntriesByYear = {}
  for (const item of entries) {
    const d = item.date
    const year = d.getUTCFullYear()
    const month = d.getUTCMonth()
    byYear[year] ??= {}
    byYear[year][month] ??= []
    byYear[year][month].push(item)
  }
  return byYear
}

const visit = (
  id: string,
  contactId: string,
  date: Date,
  extra: Partial<Visit> = {}
): Visit => ({
  id,
  contact: { id: contactId },
  date,
  isBibleStudy: false,
  ...extra,
})

const input = (
  overrides: Partial<BadgeEvaluationInput> = {}
): BadgeEvaluationInput => ({
  now: NOW,
  serviceReports: {},
  dayPlans: [],
  recurringPlans: [],
  visits: [],
  submittedReportMonths: [],
  ledger: [],
  togetherMonths: [],
  hasActiveBuddy: false,
  ...overrides,
})

/** One 0h/0m "shared" entry per month, like a checkbox Kingdom Publisher. */
const checkboxMonths = (count: number) =>
  Array.from({ length: count }, (_, i) => {
    const d = new Date(2026, 9 - i, 1, 12)
    return entry(d.getFullYear(), d.getMonth(), 3, 0)
  })

/** A pioneer logging two hours every day of each month. */
const pioneerMonths = (count: number) =>
  Array.from({ length: count }, (_, i) => {
    const d = new Date(2026, 9 - i, 1, 12)
    return Array.from({ length: 28 }, (_, day) =>
      entry(d.getFullYear(), d.getMonth(), day + 1, 120)
    )
  }).flat()

describe('sharedMonths', () => {
  it('counts the checkbox 0h marker and ignores rollover and future months', () => {
    const reports = reportsFrom([
      entry(2026, 7, 5, 0),
      entry(2026, 8, 1, 30, { rollover: true, rolloverGroupId: 'g' }),
      entry(2026, 7, 31, -30, { rollover: true, rolloverGroupId: 'g' }),
      entry(2026, 11, 2, 60),
    ])
    expect(sharedMonths(reports, '2026-10-15')).toEqual(['2026-08'])
  })
})

describe('sharedMonths ahead of time', () => {
  it('counts an entry logged ahead of time once its day arrives', () => {
    const reports = reportsFrom([entry(2026, 9, 20, 60)])
    expect(sharedMonths(reports, '2026-10-15')).toEqual([])
    expect(sharedMonths(reports, '2026-10-20')).toEqual(['2026-10'])
  })
})

describe('evaluateBadges', () => {
  it('gives a checkbox publisher and a daily pioneer the same badges', () => {
    const publisher = evaluateBadges(
      input({ serviceReports: reportsFrom(checkboxMonths(7)) })
    )
    const pioneer = evaluateBadges(
      input({ serviceReports: reportsFrom(pioneerMonths(7)) })
    )
    expect(publisher.earned.map((e) => e.key)).toEqual(
      pioneer.earned.map((e) => e.key)
    )
    expect(publisher.collections.monthsShared).toMatchObject({
      count: 7,
      level: 2,
      next: 24,
    })
  })

  it('records the month that reached each level', () => {
    const result = evaluateBadges(
      input({ serviceReports: reportsFrom(checkboxMonths(6)) })
    )
    expect(result.collections.monthsShared.reachedMonths).toEqual([
      '2026-05',
      '2026-10',
    ])
  })

  it('awards Year Round for 10 shared months of a Service Year', () => {
    // Sep 2025 – Aug 2026 with two months off, then the current year so far.
    const months = [8, 9, 10, 11, 0, 1, 3, 4, 6, 7].map((m) =>
      entry(m >= 8 ? 2025 : 2026, m, 10, 0)
    )
    const almost = evaluateBadges(
      input({ serviceReports: reportsFrom(months.slice(0, 9)) })
    )
    expect(almost.collections.yearRound.level).toBe(0)
    const done = evaluateBadges(input({ serviceReports: reportsFrom(months) }))
    expect(done.collections.yearRound).toMatchObject({
      count: 1,
      level: 1,
      reachedMonths: ['2026-08'],
    })
  })

  it('counts conversations, return visits, and follow-up topics by month', () => {
    const visits = [
      visit('v1', 'c1', new Date(2026, 7, 2, 10)),
      visit('v2', 'c1', new Date(2026, 8, 4, 10), {
        notAtHome: true,
      }),
      visit('v3', 'c1', new Date(2026, 9, 1, 10), {
        followUp: { date: new Date(2026, 9, 20), notifyMe: false, topic: 'Q' },
      }),
      visit('v4', 'c2', new Date(2026, 9, 2, 10), { notAtHome: true }),
    ]
    const result = evaluateBadges(input({ visits }))
    expect(result.collections.conversations.count).toBe(2) // Aug, Oct
    expect(result.collections.returnVisits.count).toBe(2) // Sep, Oct
    expect(result.collections.nextTime.count).toBe(1)
    expect(result.ledgerAdditions).toEqual(
      expect.arrayContaining([
        'conversations:2026-08',
        'returnVisits:2026-09',
        'nextTime:2026-10',
      ])
    )
  })

  it('keeps ledger months after the visits behind them are deleted', () => {
    const result = evaluateBadges(
      input({
        ledger: Array.from(
          { length: 6 },
          (_, i) => `returnVisits:2026-0${i + 1}`
        ),
      })
    )
    expect(result.collections.returnVisits.level).toBe(2)
    expect(result.ledgerAdditions).toEqual([])
  })

  it('tracks the most months with one person for Keeping in Touch', () => {
    const visits = [0, 1, 2, 3].map((m) =>
      visit(`k${m}`, 'c1', new Date(2026, 5 + m, 3, 10))
    )
    const result = evaluateBadges(input({ visits }))
    expect(result.collections.keepingInTouch).toMatchObject({
      count: 4,
      level: 1,
      reachedMonths: ['2026-08'],
    })
    expect(result.ledgerAdditions).toContain('keepingInTouch:4')
    const later = evaluateBadges(input({ ledger: ['keepingInTouch:6'] }))
    expect(later.collections.keepingInTouch.level).toBe(2)
  })

  it('counts Plans only once their day arrives', () => {
    const result = evaluateBadges(
      input({
        dayPlans: [
          {
            id: 'p1',
            date: normalizeDateForStorage(new Date(2026, 9, 2)),
            minutes: 60,
          },
          {
            id: 'p2',
            date: normalizeDateForStorage(new Date(2026, 10, 2)),
            minutes: 60,
          },
        ],
        recurringPlans: [
          {
            id: 'r1',
            startDate: normalizeDateForStorage(new Date(2026, 6, 6)),
            minutes: 90,
            recurrence: {
              frequency: RecurringPlanFrequencies.WEEKLY,
              interval: 1,
              endDate: normalizeDateForStorage(new Date(2026, 7, 20)),
            },
          },
        ],
      })
    )
    expect(result.collections.prepared.count).toBe(3) // Jul, Aug, Oct
  })

  it('honors skipped days, zero-minute overrides, and monthly patterns', () => {
    const weekly = {
      id: 'w1',
      startDate: normalizeDateForStorage(new Date(2026, 6, 1)),
      minutes: 60,
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: normalizeDateForStorage(new Date(2026, 7, 31)),
      },
      // Every July occurrence is skipped or zeroed; August stays planned.
      deletedDates: [1, 8, 15].map((d) =>
        normalizeDateForStorage(new Date(2026, 6, d))
      ),
      overrides: [22, 29].map((d) => ({
        date: normalizeDateForStorage(new Date(2026, 6, d)),
        minutes: 0,
      })),
    }
    const monthly = {
      id: 'm1',
      startDate: normalizeDateForStorage(new Date(2026, 0, 31)),
      minutes: 60,
      recurrence: {
        frequency: RecurringPlanFrequencies.MONTHLY,
        interval: 1,
        endDate: normalizeDateForStorage(new Date(2026, 4, 1)),
      },
    }
    const byWeekday = {
      id: 'd1',
      startDate: normalizeDateForStorage(new Date(2026, 8, 1)),
      minutes: 60,
      recurrence: {
        frequency: RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY,
        interval: 1,
        endDate: null,
        monthlyByWeekdayConfig: { weekday: 6, weekOfMonth: 1 },
      },
    }
    const months = (plan: typeof weekly | typeof monthly | typeof byWeekday) =>
      evaluateBadges(input({ recurringPlans: [plan] })).collections.prepared
        .reachedMonths
    expect(
      evaluateBadges(input({ recurringPlans: [weekly] })).collections.prepared
        .count
    ).toBe(1) // August only
    // The 31st: January and March have one; February and April don't.
    expect(
      evaluateBadges(input({ recurringPlans: [monthly] })).collections.prepared
        .count
    ).toBe(2)
    // First Saturday of September and October 2026 (Oct 3 ≤ the 15th).
    expect(
      evaluateBadges(input({ recurringPlans: [byWeekday] })).collections
        .prepared.count
    ).toBe(2)
    expect(months(weekly)).toEqual(['2026-08'])
  })

  it('evaluates a large history quickly', () => {
    const visits = Array.from({ length: 10000 }, (_, i) =>
      visit(
        `p${i}`,
        `c${i % 400}`,
        new Date(2016 + (i % 10), i % 12, 1 + (i % 27), 10),
        {
          notAtHome: i % 5 === 0,
          followUp:
            i % 7 === 0
              ? { date: new Date(2026, 0, 1), notifyMe: false, topic: 'T' }
              : undefined,
        }
      )
    )
    const plan = {
      id: 'long',
      startDate: normalizeDateForStorage(new Date(2016, 0, 2)),
      minutes: 60,
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: null,
      },
      deletedDates: Array.from({ length: 500 }, (_, i) =>
        normalizeDateForStorage(new Date(2016, 0, 2 + i * 7))
      ),
    }
    const started = performance.now()
    evaluateBadges(
      input({
        visits,
        recurringPlans: [plan],
        serviceReports: reportsFrom(pioneerMonths(24)),
      })
    )
    expect(performance.now() - started).toBeLessThan(400)
  })

  it('awards one-time badges from a study and an active buddy', () => {
    const result = evaluateBadges(
      input({
        visits: [
          visit('s0', 'c1', new Date(2026, 3, 1), {
            isBibleStudy: true,
            notAtHome: true,
          }),
          visit('s1', 'c1', new Date(2026, 4, 9), { isBibleStudy: true }),
        ],
        hasActiveBuddy: true,
        togetherMonths: ['2026-09'],
      })
    )
    expect(result.oneTime.firstBibleStudy).toEqual({
      earned: true,
      month: '2026-05',
    })
    expect(result.oneTime.firstBuddy.earned).toBe(true)
    expect(result.collections.together.level).toBe(1)
  })

  it('emits only keys the catalog knows', () => {
    const result = evaluateBadges(
      input({ serviceReports: reportsFrom(checkboxMonths(70)) })
    )
    for (const { key } of result.earned) {
      expect(ALL_BADGE_KEYS).toContain(key)
      expect(parseBadgeKey(key)).not.toBeNull()
    }
  })
})

describe('newlyEarnedBadges', () => {
  const evaluation = evaluateBadges(
    input({ serviceReports: reportsFrom(checkboxMonths(6)) })
  )

  it('stores everything quietly on the first pass', () => {
    const fresh = newlyEarnedBadges({
      evaluation,
      stored: {},
      now: NOW,
      backfill: true,
    })
    expect(fresh.map((b) => b.key)).toEqual([
      'monthsShared.1',
      'monthsShared.2',
    ])
    expect(fresh.every((b) => !b.live && b.record.history)).toBe(true)
  })

  it('celebrates a level reached this month and files an old one as history', () => {
    const next = newlyEarnedBadges({
      evaluation,
      stored: {},
      now: NOW,
      backfill: false,
    })
    expect(next.find((b) => b.key === 'monthsShared.2')?.live).toBe(true)
    expect(next.find((b) => b.key === 'monthsShared.1')?.live).toBe(false)
  })

  it('files a burst of new badges as history', () => {
    const burst = evaluateBadges(
      input({
        serviceReports: reportsFrom(checkboxMonths(1)),
        visits: [
          visit('b1', 'c1', new Date(2026, 8, 3, 10)),
          visit('b2', 'c1', new Date(2026, 9, 3, 10), {
            isBibleStudy: true,
            followUp: {
              date: new Date(2026, 9, 20),
              notifyMe: false,
              topic: 'Q',
            },
          }),
        ],
      })
    )
    const result = newlyEarnedBadges({
      evaluation: burst,
      stored: {},
      now: NOW,
      backfill: false,
    })
    expect(result.length).toBeGreaterThan(4)
    expect(result.every((b) => !b.live)).toBe(true)
  })

  it('files a level with no known month as history', () => {
    const fromLedger = evaluateBadges(input({ ledger: ['keepingInTouch:6'] }))
    const result = newlyEarnedBadges({
      evaluation: fromLedger,
      stored: {},
      now: NOW,
      backfill: false,
    })
    expect(result.map((b) => [b.key, b.live])).toEqual([
      ['keepingInTouch.1', false],
      ['keepingInTouch.2', false],
    ])
  })

  it('skips badges already stored', () => {
    expect(
      newlyEarnedBadges({
        evaluation,
        stored: { 'monthsShared.1': { at: 1 }, 'monthsShared.2': { at: 1 } },
        now: NOW,
        backfill: false,
      })
    ).toEqual([])
  })
})

describe('Buddy Card badges', () => {
  const earned = {
    'monthsShared.1': { at: 1 },
    'monthsShared.2': { at: 5 },
    firstBibleStudy: { at: 3 },
    'notAThing.1': { at: 9 },
  }

  it('shares the highest level per collection, newest first', () => {
    expect(profileBadges(earned).map((b) => [b.art, b.level])).toEqual([
      ['monthsShared', 2],
      ['firstBibleStudy', null],
    ])
    expect(buddyCardBadges(earned, { dataProtectionMode: false })).toEqual([
      { c: 'monthsShared', l: 2 },
      { c: 'firstBibleStudy' },
    ])
  })

  it('keeps First Bible Study home in data protection mode', () => {
    expect(buddyCardBadges(earned, { dataProtectionMode: true })).toEqual([
      { c: 'monthsShared', l: 2 },
    ])
  })

  it('keeps one entry per collection', () => {
    expect(
      knownSharedBadges([
        { c: 'monthsShared', l: 3 },
        { c: 'monthsShared', l: 1 },
      ])
    ).toEqual([{ c: 'monthsShared', l: 3 }])
  })

  it('ignores badges from a newer app', () => {
    expect(
      knownSharedBadges([
        { c: 'monthsShared', l: 3 },
        // @ts-expect-error unknown collection from a newer build
        { c: 'someday', l: 1 },
        // @ts-expect-error unknown level
        { c: 'yearRound', l: 7 },
      ])
    ).toEqual([{ c: 'monthsShared', l: 3 }])
  })
})
