import moment from 'moment'
import { describe, expect, it } from 'vitest'
import {
  BADGE_FIXTURE_CONTACT_ID,
  BADGE_FIXTURE_ID_PREFIX,
  buildBadgeHistoryFixture,
  buildEveryBadgeRecords,
  buildRandomBadgeRecords,
} from '@/app/dev-fixtures/badges'
import { ALL_BADGE_KEYS, parseBadgeKey } from '@/lib/badges/catalog'
import { evaluateBadges, newlyEarnedBadges } from '@/lib/badges/evaluate'
import {
  normalizeDateForStorage,
  normalizeRecurringPlan,
} from '@/lib/normalizeDate'
import { TimeEntriesByYear, TimeEntry } from '@/types/timeEntry'

/** Files entries the way `addServiceReport` does. */
const reportsFrom = (entries: TimeEntry[]): TimeEntriesByYear => {
  const byYear: TimeEntriesByYear = {}
  for (const entry of entries) {
    const date = normalizeDateForStorage(entry.date)
    const year = date.getUTCFullYear()
    const month = date.getUTCMonth()
    byYear[year] ??= {}
    byYear[year][month] ??= []
    byYear[year][month].push({ ...entry, date })
  }
  return byYear
}

const evaluateFixture = (now: Date) => {
  const fixture = buildBadgeHistoryFixture({ now })
  return evaluateBadges({
    now,
    serviceReports: reportsFrom(fixture.timeEntries),
    dayPlans: [],
    recurringPlans: fixture.recurringPlans.map(normalizeRecurringPlan),
    visits: fixture.visits,
    submittedReportMonths: fixture.submittedReportMonths,
    ledger: [],
    togetherMonths: [],
    hasActiveBuddy: false,
  })
}

const EXPECTED = [
  'monthsShared.1',
  'monthsShared.2',
  'yearRound.1',
  'reportSent.1',
  'reportSent.2',
  'prepared.1',
  'conversations.1',
  'conversations.2',
  'returnVisits.1',
  'returnVisits.2',
  'nextTime.1',
  'keepingInTouch.1',
  'keepingInTouch.2',
  'firstBibleStudy',
]

// Every month of a year, on the 1st early, mid-month, and the last day: Year
// Round depends on where `now` falls in the Service Year.
const NOWS = Array.from({ length: 12 }, (_, month) => [
  new Date(2026, month, 1, 0, 30),
  new Date(2026, month, 15, 12),
  moment({ year: 2027, month }).endOf('month').subtract(1, 'hour').toDate(),
]).flat()

describe('buildBadgeHistoryFixture', () => {
  const now = new Date(2026, 9, 7, 15)

  it('is deterministic so re-runs upsert the same records', () => {
    expect(buildBadgeHistoryFixture({ now })).toEqual(
      buildBadgeHistoryFixture({ now })
    )
  })

  it('prefixes every id and links visits to its contact', () => {
    const fixture = buildBadgeHistoryFixture({ now })
    const ids = [
      ...fixture.contacts,
      ...fixture.visits,
      ...fixture.timeEntries,
      ...fixture.recurringPlans,
    ].map((record) => record.id)
    expect(
      ids.every((value) => value.startsWith(BADGE_FIXTURE_ID_PREFIX))
    ).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
    expect(
      fixture.visits.every(
        (visit) => visit.contact.id === BADGE_FIXTURE_CONTACT_ID
      )
    ).toBe(true)
  })

  it.each(NOWS)('earns the intended spread on %s', (date) => {
    const evaluation = evaluateFixture(date)
    const earned = evaluation.earned.map(({ key }) => key)
    expect(earned.sort()).toEqual([...EXPECTED].sort())
    // Just enough: nothing reaches Gold.
    expect(earned.some((key) => key.endsWith('.3'))).toBe(false)
  })

  it.each(NOWS)('never dates history after now on %s', (date) => {
    const fixture = buildBadgeHistoryFixture({ now: date })
    for (const entry of fixture.timeEntries)
      expect(entry.date.getTime()).toBeLessThanOrEqual(date.getTime())
    for (const visit of fixture.visits)
      expect(visit.date.getTime()).toBeLessThanOrEqual(date.getTime())
  })

  it('celebrates the two levels reached last month and files the rest', () => {
    const evaluation = evaluateFixture(now)
    const fresh = newlyEarnedBadges({
      evaluation,
      stored: {},
      now,
      backfill: false,
    })
    expect(
      fresh
        .filter((badge) => badge.live)
        .map((badge) => badge.key)
        .sort()
    ).toEqual(['reportSent.2', 'returnVisits.2'])
    expect(fresh.filter((badge) => !badge.live)).toHaveLength(
      EXPECTED.length - 2
    )
  })
})

/** Small seeded PRNG (mulberry32) for repeatable "random" sets. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

describe('buildEveryBadgeRecords', () => {
  const now = new Date(2026, 9, 7, 15)
  const records = buildEveryBadgeRecords({ now })

  it('covers every key, as history, before now', () => {
    expect(records.map(({ key }) => key).sort()).toEqual(
      [...ALL_BADGE_KEYS].sort()
    )
    for (const { record } of records) {
      expect(record.history).toBe(true)
      expect(record.at).toBeLessThanOrEqual(now.getTime())
    }
  })

  it('reaches each level after the one before it', () => {
    const byKey = new Map(records.map(({ key, record }) => [key, record]))
    for (const { key, record } of records) {
      const parsed = parseBadgeKey(key)!
      if (!parsed.level || parsed.level === 1) continue
      const previous = byKey.get(
        `${parsed.art}.${parsed.level - 1}` as typeof key
      )!
      expect(previous.month! < record.month!).toBe(true)
    }
  })
})

describe('buildRandomBadgeRecords', () => {
  const now = new Date(2026, 9, 7, 15)

  it.each(Array.from({ length: 40 }, (_, seed) => seed))(
    'builds a consistent mixed set (seed %i)',
    (seed) => {
      const records = buildRandomBadgeRecords({ now, random: seeded(seed) })
      const keys = records.map(({ key }) => key)
      expect(keys.length).toBeGreaterThan(0)
      expect(new Set(keys).size).toBe(keys.length)
      for (const { key, record } of records) {
        const parsed = parseBadgeKey(key)
        expect(parsed).not.toBeNull()
        expect(record.at).toBeLessThanOrEqual(now.getTime())
        // Lower levels come along with every earned level.
        for (let level = 1; level < (parsed!.level ?? 0); level++)
          expect(keys).toContain(`${parsed!.art}.${level}`)
      }
      const recent = records.filter(({ record }) => !record.history)
      expect(recent.length).toBe(
        Math.min(2, new Set(keys.map((k) => parseBadgeKey(k)!.art)).size)
      )
      for (const { record } of recent) expect(record.at).toBe(now.getTime())
    }
  )
})
