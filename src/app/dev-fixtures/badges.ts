import moment from 'moment'
import {
  BADGE_COLLECTIONS,
  BadgeCollectionSpec,
  badgeKey,
} from '@/lib/badges/catalog'
import {
  BADGE_LEVELS,
  BadgeArtId,
  BadgeKey,
  BadgeLevel,
  EarnedBadge,
} from '@/types/badges'
import { Contact } from '@/types/contact'
import {
  RecurringPlan,
  RecurringPlanFrequencies,
  TimeEntry,
} from '@/types/timeEntry'
import { Visit } from '@/types/visit'

/**
 * Dev-only badge fixtures for Tools and the verification harness.
 *
 * Pure on purpose — no store access, no `Date.now()`; every date derives from
 * `now` — so ids stay stable and re-running a generator upserts the same
 * records instead of piling up duplicates.
 */

export const BADGE_FIXTURE_ID_PREFIX = 'dev-badges-'

const id = (suffix: string) => `${BADGE_FIXTURE_ID_PREFIX}${suffix}`

export const BADGE_FIXTURE_CONTACT_ID = id('contact-0')

export type BadgeHistoryFixture = {
  contacts: Contact[]
  visits: Visit[]
  timeEntries: TimeEntry[]
  recurringPlans: RecurringPlan[]
  /** `YYYY-MM` months whose report counts as sent. */
  submittedReportMonths: string[]
}

/** Gold Sharing the Good News needs 24 months; stay one short of it. */
const MAX_SHARED_MONTHS_AGO = 22

/** Start of the September-to-August Service Year containing `now`. */
const serviceYearStart = (now: moment.Moment) => {
  const start = now.clone().startOf('month').month(8)
  return now.month() >= 8 ? start : start.subtract(1, 'year')
}

/**
 * Just enough history to earn a spread of badges on any day:
 *
 * - Sharing the Good News, Silver: a Time Entry every month from the start of the
 *   previous Service Year (13 to 23 months).
 * - Year Round, Bronze: that whole previous Service Year.
 * - Reports Sent, Silver: the last six finished months' reports sent.
 * - Ready to Go, Bronze: a weekly Recurring Plan since three months ago.
 * - Kind Words, Keeping in Touch, Return Visits, Silver: one Contact visited
 *   every month for eight months, in person each time.
 * - Next Time, Bronze: follow-up topics on the last three of those visits.
 * - First Bible Study: the visits from five months ago on are studies.
 *
 * Return Visits and Reports Sent reach Silver last month, so a non-quiet
 * evaluation celebrates those two and files the rest as history.
 */
export const buildBadgeHistoryFixture = ({
  now: nowInput,
}: {
  now: moment.Moment | Date
}): BadgeHistoryFixture => {
  const now = moment(nowInput)
  const monthStart = (monthsAgo: number) =>
    now.clone().startOf('month').subtract(monthsAgo, 'months')
  /** A day in that month, never later than `now`. */
  const dayIn = (monthsAgo: number, day: number, hour: number) =>
    moment.min(monthStart(monthsAgo).date(day).hour(hour), now.clone())

  const sharedSince = Math.min(
    now
      .clone()
      .startOf('month')
      .diff(serviceYearStart(now).subtract(1, 'year'), 'months'),
    MAX_SHARED_MONTHS_AGO
  )
  const timeEntries: TimeEntry[] = []
  for (let monthsAgo = sharedSince; monthsAgo >= 0; monthsAgo--) {
    timeEntries.push({
      id: id(`entry-${monthStart(monthsAgo).format('YYYY-MM')}`),
      date: dayIn(monthsAgo, 3, 12).toDate(),
      hours: 2 + (monthsAgo % 3),
      minutes: monthsAgo % 2 === 0 ? 30 : 0,
    })
  }

  const VISIT_MONTHS = 8
  const visitDate = (monthsAgo: number) =>
    monthsAgo === 0 ? dayIn(0, 2, 10) : dayIn(monthsAgo, 12, 10)
  const firstVisit = visitDate(VISIT_MONTHS - 1)
  const contacts: Contact[] = [
    {
      id: BADGE_FIXTURE_CONTACT_ID,
      name: 'Marisol Vega',
      createdAt: firstVisit.clone().subtract(1, 'day').toDate(),
    },
  ]
  const TOPICS = [
    'Read Psalm 37:29 together',
    'Continue lesson 4',
    'Bring the brochure on family life',
  ]
  const visits: Visit[] = []
  for (let monthsAgo = VISIT_MONTHS - 1; monthsAgo >= 0; monthsAgo--) {
    const followUpDate =
      monthsAgo === 0
        ? now.clone().add(6, 'days').startOf('day').hour(10)
        : visitDate(monthsAgo - 1)
    visits.push({
      id: id(`visit-${VISIT_MONTHS - 1 - monthsAgo}`),
      contact: { id: BADGE_FIXTURE_CONTACT_ID },
      date: visitDate(monthsAgo).toDate(),
      note: monthsAgo === VISIT_MONTHS - 1 ? 'Talked about family' : '',
      isBibleStudy: monthsAgo <= 5,
      followUp:
        monthsAgo <= 2
          ? {
              date: followUpDate.toDate(),
              notifyMe: false,
              topic: TOPICS[monthsAgo],
            }
          : undefined,
    })
  }

  const recurringPlans: RecurringPlan[] = [
    {
      id: id('recurring-saturday'),
      // The first Saturday of the month three months ago (`day(6)` stays in
      // the 1st's Sunday-to-Saturday week), so every month since has one.
      startDate: monthStart(3).day(6).toDate(),
      minutes: 120,
      startTimeInMinutes: 9 * 60 + 30,
      title: 'Saturday cart witnessing',
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: null,
      },
    },
  ]

  const submittedReportMonths = [6, 5, 4, 3, 2, 1].map((monthsAgo) =>
    monthStart(monthsAgo).format('YYYY-MM')
  )

  return {
    contacts,
    visits,
    timeEntries,
    recurringPlans,
    submittedReportMonths,
  }
}

export type FixtureEarnedBadge = { key: BadgeKey; record: EarnedBadge }

/** Service Years for Year Round, months for every other collection. */
const monthsPerStep = (spec: BadgeCollectionSpec) =>
  spec.id === 'yearRound' ? 12 : 1

const monthRecord = (
  now: moment.Moment,
  monthsAgo: number,
  extra: Partial<EarnedBadge> = {}
): EarnedBadge => {
  const month = now.clone().startOf('month').subtract(monthsAgo, 'months')
  return {
    at: Math.min(month.clone().date(15).hour(12).valueOf(), now.valueOf()),
    month: month.format('YYYY-MM'),
    ...extra,
  }
}

/**
 * Every badge the catalog can award, as history, with each level reached a
 * plausible number of months after the one before it.
 */
export const buildEveryBadgeRecords = ({
  now: nowInput,
}: {
  now: moment.Moment | Date
}): FixtureEarnedBadge[] => {
  const now = moment(nowInput)
  const records: FixtureEarnedBadge[] = BADGE_COLLECTIONS.flatMap(
    (spec, index) =>
      BADGE_LEVELS.map((level) => ({
        key: badgeKey(spec.id, level),
        record: monthRecord(
          now,
          1 +
            index +
            (spec.thresholds[3] - spec.thresholds[level - 1]) *
              monthsPerStep(spec),
          { history: true }
        ),
      }))
  )
  records.push(
    {
      key: badgeKey('firstBibleStudy'),
      record: monthRecord(now, 30, { history: true }),
    },
    {
      key: badgeKey('firstBuddy'),
      record: monthRecord(now, 4, { history: true }),
    }
  )
  return records
}

/** Chance of reaching no level, then Bronze, Silver, Gold, and Pearl. */
const LEVEL_ODDS = [0.2, 0.35, 0.28, 0.13, 0.04]
const RARE_LEVEL_ODDS = [0.45, 0.35, 0.15, 0.05, 0]

const pickLevel = (random: () => number, odds: number[]): BadgeLevel | 0 => {
  let roll = random()
  for (let level = 0; level < odds.length; level++) {
    roll -= odds[level]
    if (roll < 0) return level as BadgeLevel | 0
  }
  return 0
}

/**
 * A realistic mixed collection: most collections at Bronze or Silver, the odd
 * Gold or Pearl, rarer Year Round and Two by Two, and sometimes the One-time
 * Badges. `recent` of them were earned just now (no `history`), so they read as
 * new; everything else is history from past months.
 */
export const buildRandomBadgeRecords = ({
  now: nowInput,
  random = Math.random,
  recent = 2,
}: {
  now: moment.Moment | Date
  random?: () => number
  recent?: number
}): FixtureEarnedBadge[] => {
  const now = moment(nowInput)
  const levels = new Map<BadgeArtId, BadgeLevel | 0>()
  for (const spec of BADGE_COLLECTIONS) {
    const rare = spec.id === 'yearRound' || spec.id === 'together'
    levels.set(spec.id, pickLevel(random, rare ? RARE_LEVEL_ODDS : LEVEL_ODDS))
  }
  // Always earn at least one collection, so the set is never empty.
  if ([...levels.values()].every((level) => level === 0))
    levels.set('monthsShared', 1)
  const oneTime: BadgeArtId[] = []
  if (random() < 0.6) oneTime.push('firstBibleStudy')
  if (random() < 0.35) oneTime.push('firstBuddy')

  const earnedArts = [
    ...[...levels.entries()]
      .filter(([, level]) => level > 0)
      .map(([art]) => art),
    ...oneTime,
  ]
  const recentArts = new Set<BadgeArtId>()
  const pool = [...earnedArts]
  while (recentArts.size < Math.min(recent, earnedArts.length)) {
    const [art] = pool.splice(Math.floor(random() * pool.length), 1)
    recentArts.add(art)
  }
  const nowRecord = (): EarnedBadge => ({
    at: now.valueOf(),
    month: now.format('YYYY-MM'),
  })

  const records: FixtureEarnedBadge[] = []
  for (const spec of BADGE_COLLECTIONS) {
    const top = levels.get(spec.id) ?? 0
    if (top === 0) continue
    const isRecent = recentArts.has(spec.id)
    const base = isRecent ? 0 : 2 + Math.floor(random() * 10)
    for (let level = 1; level <= top; level++) {
      const monthsAgo =
        base +
        (spec.thresholds[top - 1] - spec.thresholds[level - 1]) *
          monthsPerStep(spec)
      records.push({
        key: badgeKey(spec.id, level as BadgeLevel),
        record:
          isRecent && level === top
            ? nowRecord()
            : monthRecord(now, monthsAgo, { history: true }),
      })
    }
  }
  for (const art of oneTime) {
    records.push({
      key: badgeKey(art),
      record: recentArts.has(art)
        ? nowRecord()
        : monthRecord(now, 3 + Math.floor(random() * 24), { history: true }),
    })
  }
  return records
}
