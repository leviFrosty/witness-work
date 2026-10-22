import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

// Daylight saving sweep: each surface that turns a calendar day or a time of
// day into a moment, on the days clocks change. On a fall-back day 1:00–1:59
// happens twice (the day has 25 hours); on a spring-forward day 2:00–2:59
// never happens (23 hours). Tokyo has no daylight saving and is the control.

const units = vi.hoisted<Record<string, string>>(() => ({
  hoursCompact: 'h',
  minutesCompact: 'm',
}))
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, options?: { defaultValue?: string }) =>
      units[key] ?? options?.defaultValue ?? key,
  },
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: () => ({ timeDisplayFormat: 'decimal' }),
}))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
  getCalendars: () => [{ uses24hourClock: false, firstWeekday: 1 }],
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('../../modules/stopwatch-bridge', () => ({
  isAvailable: () => false,
}))

import moment from 'moment'
import { buildUpNext } from '@/app/watch/buildUpNext'
import { joinRequestExpiry } from '@/features/buddies/lib/joinRequests'
import {
  computeElapsedMs,
  sessionStartMs,
  splitElapsed,
} from '@/features/service-reports/hooks/useStopWatch'
import {
  followUpCardItems,
  overdueFollowUpConversations,
} from '@/lib/conversations'
import { formatStartTime } from '@/lib/dates'
import {
  combineDateAndStartTime,
  normalizeDateForStorage,
  storedDayKey,
} from '@/lib/normalizeDate'
import {
  getPlansIntersectingDay,
  plannedMinutesThroughEachDayOfMonth,
} from '@/lib/recurrence'
import { buildReminderSchedule } from '@/lib/reminderSchedule'
import { loggedMinutesThroughEachDayOfMonth } from '@/lib/scheduleStatus'
import { unloggedDayReminderGroups } from '@/lib/unloggedDayReminders'
import { weekPlanReminderDates } from '@/lib/weekPlanReminders'
import {
  RecurringPlanFrequencies,
  type DayPlan,
  type RecurringPlan,
  type TimeEntriesByYear,
} from '@/types/timeEntry'
import type { Visit } from '@/types/visit'

type Transition = {
  zone: string
  /** The transition day, `YYYY-MM-DD`; a Sunday in every zone here. */
  day: string
  /** Hours in that day. */
  hours: 23 | 24 | 25
}

const TRANSITIONS: Transition[] = [
  { zone: 'America/New_York', day: '2026-11-01', hours: 25 },
  { zone: 'America/New_York', day: '2026-03-08', hours: 23 },
  { zone: 'Europe/London', day: '2026-10-25', hours: 25 },
  { zone: 'Australia/Sydney', day: '2026-10-04', hours: 23 },
  { zone: 'Asia/Tokyo', day: '2026-11-01', hours: 24 },
]

const originalTZ = process.env.TZ
afterEach(() => {
  vi.useRealTimers()
})
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ
  else process.env.TZ = originalTZ
})

describe.each(TRANSITIONS)(
  '$zone on $day ($hours h)',
  ({ zone, day, hours }) => {
    const [y, m, d] = day.split('-').map(Number)
    /** Local wall-clock time on the transition day (or `days` from it). */
    const at = (hour: number, minute = 0, days = 0) =>
      new Date(y, m - 1, d + days, hour, minute)
    const stored = (days = 0) => normalizeDateForStorage(at(12, 0, days))
    const extra = hours - 24
    const setNow = (date: Date) => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(date)
    }

    // Set the zone before each test body (describe.each bodies run at
    // collection time, so zone-dependent values are built inside `it`).
    const inZone = (fn: () => void) => () => {
      process.env.TZ = zone
      fn()
    }

    it(
      'the timer counts real elapsed time across the change, and its entry lands on the day it began',
      inZone(() => {
        const start = at(0, 30)
        const now = at(4, 30)
        const state = {
          startedAt: start.getTime() / 1000,
          accumulatedMs: 0,
          isRunning: true,
          updatedAt: start.getTime() / 1000,
        }
        const elapsed = computeElapsedMs(state, now.getTime())
        expect(elapsed).toBe((4 + extra) * 60 * 60_000)
        expect(splitElapsed(elapsed)).toEqual({ hours: 4 + extra, minutes: 0 })
        const began = sessionStartMs(state, now.getTime())!
        // Add Time's route date, as TimerSection hands it over.
        const routeDate = moment(new Date(began).toISOString()).toDate()
        expect(storedDayKey(normalizeDateForStorage(routeDate))).toBe(day)
      })
    )

    it(
      'Add Time keeps the day for an entry saved inside the repeated or missing hour',
      inZone(() => {
        for (const minute of [0, 30, 59]) {
          const saved = at(1, minute)
          expect(storedDayKey(normalizeDateForStorage(saved))).toBe(day)
          expect(storedDayKey(normalizeDateForStorage(at(2, minute)))).toBe(day)
        }
      })
    )

    it(
      'shows a Plan’s start time as set, on the day itself',
      inZone(() => {
        setNow(at(12))
        expect(formatStartTime(10 * 60)).toBe('10:00 AM')
        expect(formatStartTime(23 * 60 + 30)).toBe('11:30 PM')
        expect(formatStartTime(30)).toBe('12:30 AM')
      })
    )

    it(
      'a Plan at 1:30 or 2:30 starts once, at that wall-clock time or just after a skipped hour',
      inZone(() => {
        const oneThirty = combineDateAndStartTime(stored(), 90)
        expect([oneThirty.getHours(), oneThirty.getMinutes()]).toEqual([1, 30])
        const twoThirty = combineDateAndStartTime(stored(), 150)
        expect([twoThirty.getHours(), twoThirty.getMinutes()]).toEqual(
          hours === 23 ? [3, 30] : [2, 30]
        )
        expect(storedDayKey(normalizeDateForStorage(twoThirty))).toBe(day)
      })
    )

    const sundayPlan = (
      frequency: RecurringPlanFrequencies,
      fields: Partial<RecurringPlan> = {}
    ): RecurringPlan => ({
      id: `r${frequency}`,
      startDate: stored(-28),
      minutes: 120,
      startTimeInMinutes: 90,
      recurrence: { frequency, interval: 1, endDate: null },
      ...fields,
    })

    it(
      'weekly and “nth Sunday” Recurring Plans fall on the day once, with its key',
      inZone(() => {
        const weekly = sundayPlan(RecurringPlanFrequencies.WEEKLY)
        const nth = sundayPlan(RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY, {
          recurrence: {
            frequency: RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY,
            interval: 1,
            endDate: null,
            monthlyByWeekdayConfig: {
              weekday: 0,
              weekOfMonth: Math.ceil(d / 7),
            },
          },
        })
        const keys: string[] = []
        const weeklyDays: string[] = []
        const nthDays: string[] = []
        // Walk local midnights, as calendars and the watch do.
        const cursor = moment(at(0)).subtract(7, 'days')
        for (let i = 0; i <= 14; i++, cursor.add(1, 'day')) {
          const key = cursor.format('YYYY-MM-DD')
          keys.push(key)
          for (const dayDate of [cursor.toDate(), at(12, 0, i - 7)]) {
            if (getPlansIntersectingDay(dayDate, [weekly]).length)
              weeklyDays.push(key)
            if (getPlansIntersectingDay(dayDate, [nth]).length)
              nthDays.push(key)
          }
        }
        expect(new Set(keys).size).toBe(15)
        expect(keys[7]).toBe(day)
        const week = (days: number) =>
          moment(day).add(days, 'days').format('YYYY-MM-DD')
        // Each matched twice: once from midnight, once from noon.
        expect(weeklyDays).toEqual([
          week(-7),
          week(-7),
          day,
          day,
          week(7),
          week(7),
        ])
        expect(nthDays).toEqual([day, day])
      })
    )

    it(
      'reminds once for a Plan at 1:30 and at 2:30, and “1 day before” at the same time of day',
      inZone(() => {
        const plan = (
          id: string,
          start: number,
          extraFields = {}
        ): DayPlan => ({
          id,
          date: stored(),
          minutes: 60,
          startTimeInMinutes: start,
          notifyMe: true,
          reminderOffsetMinutes: 0,
          ...extraFields,
        })
        const recurring = sundayPlan(RecurringPlanFrequencies.WEEKLY, {
          startTimeInMinutes: 150,
          notifyMe: true,
          reminderOffsetMinutes: 0,
        })
        const schedule = buildReminderSchedule({
          contacts: [],
          visits: [],
          plans: [
            plan('p130', 90),
            plan('p230', 150),
            plan('p10', 600, { reminderOffsetMinutes: 1440 }),
          ],
          recurringPlans: [recurring],
          visitOffset: { amount: 30, unit: 'minutes' },
          planOffset: { amount: 30, unit: 'minutes' },
          now: at(12, 0, -3).getTime(),
        })
        const ids = schedule.map((r) => r.id)
        expect(new Set(ids).size).toBe(ids.length)
        const byId = (id: string) => schedule.filter((r) => r.id.includes(id))
        const clock = (date: Date) => [
          moment(date).format('YYYY-MM-DD'),
          date.getHours(),
          date.getMinutes(),
        ]
        expect(byId('p130').map((r) => clock(r.date))).toEqual([[day, 1, 30]])
        // Fall back: the first 1:30, before clocks change.
        if (hours === 25)
          expect(byId('p130')[0].date.getTime()).toBeLessThan(
            at(3).getTime() - 2 * 60 * 60_000
          )
        const twoThirty = hours === 23 ? [day, 3, 30] : [day, 2, 30]
        expect(byId('p230').map((r) => clock(r.date))).toEqual([twoThirty])
        expect(
          byId(`${recurring.id}-${day}`).map((r) => clock(r.date))
        ).toEqual([twoThirty])
        // #864: whole days count on the wall clock.
        expect(byId('p10').map((r) => clock(r.date))).toEqual([
          [moment(day).subtract(1, 'day').format('YYYY-MM-DD'), 10, 0],
        ])
      })
    )

    it(
      'reminds to log a planned day and to plan next week at their set times',
      inZone(() => {
        const plans: DayPlan[] = [
          { id: 'p', date: stored(), minutes: 120, startTimeInMinutes: 600 },
        ]
        const unlogged = unloggedDayReminderGroups(
          {
            dayPlans: plans,
            recurringPlans: [],
            timeEntries: {},
            remindAt: 20 * 60,
            enabledAt: 0,
            tracksHoursIn: () => true,
          },
          at(9).getTime()
        )
        expect(
          unlogged.map(({ date, days }) => [
            date.getHours(),
            date.getMinutes(),
            days.map((x) => x.key),
          ])
        ).toEqual([[20, 0, [day]]])
        const weekly = weekPlanReminderDates(
          {
            dayPlans: [],
            recurringPlans: [],
            offDays: [],
            weekday: 0,
            remindAt: 18 * 60,
            enabledAt: 0,
          },
          at(9).getTime()
        ).find(({ date }) => moment(date).format('YYYY-MM-DD') === day)
        expect(
          weekly && [weekly.date.getHours(), weekly.date.getMinutes()]
        ).toEqual([18, 0])
      })
    )

    it(
      'counts the day in month totals once, under its own date',
      inZone(() => {
        const month = m - 1
        const weekly = sundayPlan(RecurringPlanFrequencies.WEEKLY)
        const planned = plannedMinutesThroughEachDayOfMonth(
          month,
          y,
          [],
          [weekly]
        )
        const daysInMonth = moment(day).daysInMonth()
        expect(planned).toHaveLength(daysInMonth)
        expect(planned[d - 1] - (planned[d - 2] ?? 0)).toBe(120)
        const reports: TimeEntriesByYear = {
          [y]: {
            [month]: [
              {
                id: 'e',
                hours: 1,
                minutes: 0,
                date: normalizeDateForStorage(at(1, 30)),
              },
            ],
          },
        }
        const logged = loggedMinutesThroughEachDayOfMonth({
          month,
          year: y,
          serviceReports: reports,
          publisher: 'regularPioneer',
          creditLimit: { enabled: false, customLimitHours: 0 },
        })
        expect(logged).toHaveLength(daysInMonth)
        expect(logged[d - 1]).toBe(60)
        expect(logged[d - 2] ?? 0).toBe(0)
      })
    )

    it(
      'a Follow-up is missed 4 hours after its time, and on the card until then',
      inZone(() => {
        const due = at(1, 30)
        const visit: Visit = {
          id: 'v',
          contact: { id: 'c' },
          date: at(12, 0, -7),
          isBibleStudy: false,
          followUp: { date: due, notifyMe: false },
        }
        const later = (minutes: number) =>
          new Date(due.getTime() + minutes * 60_000)
        const card = (now: Date) =>
          followUpCardItems({ currentTime: now, conversations: [visit] }).length
        const missed = (now: Date) =>
          overdueFollowUpConversations({
            currentTime: now,
            conversations: [visit],
            lookbackDays: 7,
          }).length
        expect([card(later(239)), missed(later(239))]).toEqual([1, 0])
        expect([card(later(241)), missed(later(241))]).toEqual([0, 1])
      })
    )

    it(
      'the watch’s Up Next starts a Plan at its wall-clock time and a day at its midnight',
      inZone(() => {
        setNow(at(0, 5))
        const plans: DayPlan[] = [
          { id: 'timed', date: stored(), minutes: 60, startTimeInMinutes: 600 },
          { id: 'late', date: stored(), minutes: 60, startTimeInMinutes: 1410 },
          { id: 'anytime', date: stored(), minutes: 60, anytime: true },
        ]
        const items = buildUpNext({
          contacts: [],
          conversations: [],
          dayPlans: plans,
          recurringPlans: [],
          categories: [],
          includePlans: true,
        })
        const byId = new Map(items.map((item) => [item.id, item]))
        expect(byId.get('timed')?.start).toBe(at(10).getTime())
        expect(byId.get('late')?.start).toBe(at(23, 30).getTime())
        expect(byId.get('anytime')?.start).toBe(at(0).getTime())
        expect(byId.get('anytime')?.day).toBe(day)
      })
    )

    it(
      'a buddy’s join request lapses at the Plan’s start on the day',
      inZone(() => {
        expect(joinRequestExpiry(day, 600)).toBe(at(10).getTime())
        expect(joinRequestExpiry(day, undefined)).toBe(at(12).getTime())
      })
    )
  }
)
