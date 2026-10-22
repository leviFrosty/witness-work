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
import { daysSinceInstallBucket } from '@/features/onboarding/lib/homeChecklist'
import {
  computeElapsedMs,
  sessionStartMs,
  splitElapsed,
} from '@/features/service-reports/hooks/useStopWatch'
import {
  followUpCardItems,
  overdueFollowUpConversations,
} from '@/lib/conversations'
import { formatCalendar, formatStartTime } from '@/lib/dates'
import { dayPhrase, distancePhrase } from '@/lib/dayPhrases'
import {
  combineDateAndStartTime,
  normalizeDateForStorage,
  storedDayKey,
} from '@/lib/normalizeDate'
import {
  getPlansIntersectingDay,
  plannedMinutesThroughEachDayOfMonth,
} from '@/lib/recurrence'
import { reminderContent } from '@/lib/reminderContent'
import { buildReminderSchedule } from '@/lib/reminderSchedule'
import { loggedMinutesThroughEachDayOfMonth } from '@/lib/scheduleStatus'
import {
  serviceStreak,
  streakEndsSoon,
  type ServiceStreak,
} from '@/lib/serviceStreak'
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
  /** The transition day, `YYYY-MM-DD`. */
  day: string
  /** Hours in that day. */
  hours: 23 | 24 | 25
}

// Clocks change in the small hours; each day is a Sunday.
const TRANSITIONS: Transition[] = [
  { zone: 'America/New_York', day: '2026-11-01', hours: 25 },
  { zone: 'America/New_York', day: '2026-03-08', hours: 23 },
  { zone: 'Europe/London', day: '2026-10-25', hours: 25 },
  { zone: 'Australia/Sydney', day: '2026-10-04', hours: 23 },
  { zone: 'Asia/Tokyo', day: '2026-11-01', hours: 24 },
]

// Clocks change at midnight. Springing forward, the day starts at 1:00 (there
// is no midnight); falling back, midnight happens twice.
const MIDNIGHT_TRANSITIONS: Transition[] = [
  { zone: 'America/Havana', day: '2026-03-08', hours: 23 },
  { zone: 'America/Havana', day: '2026-11-01', hours: 25 },
  { zone: 'America/Santiago', day: '2026-09-06', hours: 23 },
  { zone: 'Atlantic/Azores', day: '2026-03-29', hours: 23 },
  { zone: 'Atlantic/Azores', day: '2026-10-25', hours: 25 },
  { zone: 'Asia/Beirut', day: '2026-03-29', hours: 23 },
  { zone: 'Africa/Cairo', day: '2026-04-24', hours: 23 },
]

const originalTZ = process.env.TZ
afterEach(() => {
  vi.useRealTimers()
})
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ
  else process.env.TZ = originalTZ
})

const onTransition = ({ zone, day }: Transition) => {
  const [y, m, d] = day.split('-').map(Number)
  /** Local wall-clock time on the transition day (or `days` from it). */
  const at = (hour: number, minute = 0, days = 0) =>
    new Date(y, m - 1, d + days, hour, minute)
  return {
    y,
    m,
    d,
    at,
    stored: (days = 0) => normalizeDateForStorage(at(12, 0, days)),
    /** `YYYY-MM-DD`, `days` from the transition day. */
    key: (days = 0) => moment(day).add(days, 'days').format('YYYY-MM-DD'),
    setNow: (date: Date) => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(date)
    },
    // Set the zone before each test body (describe.each bodies run at
    // collection time, so zone-dependent values are built inside `it`).
    inZone: (fn: () => void) => () => {
      process.env.TZ = zone
      fn()
    },
  }
}

describe.each(TRANSITIONS)(
  '$zone on $day ($hours h)',
  ({ zone, day, hours }) => {
    const { y, m, d, at, stored, setNow, inZone } = onTransition({
      zone,
      day,
      hours,
    })
    const extra = hours - 24

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

describe.each(MIDNIGHT_TRANSITIONS)(
  '$zone on $day ($hours h, clocks change at midnight)',
  (transition) => {
    const { day } = transition
    const { y, m, d, at, stored, key, setNow, inZone } =
      onTransition(transition)
    /** The start of a day, as `moment` reads its date. */
    const startOf = (days: number) => moment(key(days)).toDate()
    /** Around the day: each day's first minute, small hours, noon, and night. */
    const nows = () =>
      [-1, 0, 1].flatMap((days) => [
        startOf(days),
        at(0, 30, days),
        at(12, 0, days),
        at(23, 30, days),
      ])
    /** `days` from `now`'s date, at `hour`:30. */
    const daysFrom = (now: Date, days: number, hour: number) =>
      new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + days,
        hour,
        30
      )

    it(
      'says today, tomorrow, yesterday and “in 2 days” by the calendar',
      inZone(() => {
        const names: Record<number, string> = {
          [-1]: 'dayPhrase_yesterday',
          0: 'dayPhrase_today',
          1: 'dayPhrase_tomorrow',
        }
        const distances: Record<number, string> = {
          [-2]: '2 days ago',
          [-1]: 'a day ago',
          1: 'in a day',
          2: 'in 2 days',
        }
        for (const now of nows())
          for (const days of [-2, -1, 0, 1, 2])
            for (const hour of [0, 12, 23]) {
              const date = daysFrom(now, days, hour)
              const when = [now.toString(), date.toString()]
              expect([...when, dayPhrase(date, now.getTime())]).toEqual([
                ...when,
                names[days] ?? moment(date).format('dddd'),
              ])
              if (days !== 0)
                expect([...when, distancePhrase(date, now.getTime())]).toEqual([
                  ...when,
                  distances[days],
                ])
            }
      })
    )

    it(
      'formats Today, Tomorrow and Yesterday by the calendar',
      inZone(() => {
        const names: Record<number, string> = {
          [-1]: 'Yesterday',
          0: 'Today',
          1: 'Tomorrow',
        }
        for (const now of nows())
          for (const days of [-1, 0, 1])
            for (const hour of [0, 23]) {
              const date = daysFrom(now, days, hour)
              const when = [now.toString(), date.toString()]
              const label = formatCalendar(date, { referenceTime: now })
              expect([...when, label.split(' ')[0]]).toEqual([
                ...when,
                names[days],
              ])
            }
      })
    )

    it(
      'a reminder to log time says today or yesterday by the calendar',
      inZone(() => {
        const body = (target: number, firesOn: number) =>
          reminderContent(
            {
              id: `u${target}`,
              kind: 'unloggedDay',
              targetId: key(target),
              date: at(20, 0, firesOn),
              anchor: at(11, 0, target),
              minutes: 120,
              days: [key(target)],
            },
            { dataProtectionMode: false, timeDisplayFormat: 'short' }
          ).body
        expect(body(0, 0)).toBe('unloggedDayReminderBodyToday')
        expect(body(0, 1)).toBe('unloggedDayReminderBodyYesterday')
        expect(body(-1, 0)).toBe('unloggedDayReminderBodyYesterday')
        expect(body(1, 1)).toBe('unloggedDayReminderBodyToday')
        expect(body(-1, 1)).toBe('unloggedDayReminderBodyOnDate')
      })
    )

    it(
      'counts days since install by the calendar',
      inZone(() => {
        expect(daysSinceInstallBucket(at(0, 30), at(23, 30))).toBe('0')
        expect(daysSinceInstallBucket(at(12), at(0, 30, 1))).toBe('1')
        expect(daysSinceInstallBucket(at(23, 30, -1), at(0, 30))).toBe('1')
        expect(daysSinceInstallBucket(at(12, 0, -1), at(23, 30, 1))).toBe('2_3')
      })
    )

    it(
      'a Plans streak ends at midnight, and warns from the last day’s start',
      inZone(() => {
        for (const planDay of [-1, 0, 1])
          for (const nowDay of [planDay - 2, planDay - 1, planDay]) {
            const streak = serviceStreak(
              'plans',
              {
                serviceReports: {},
                dayPlans: [{ id: 'p', date: stored(planDay), minutes: 60 }],
                recurringPlans: [],
              },
              at(12, 0, nowDay)
            )
            expect([nowDay, streak.due]).toEqual([
              nowDay,
              { period: key(planDay), endsAt: startOf(planDay + 2) },
            ])
          }
        for (const endsDay of [0, 1, 2]) {
          const streak: ServiceStreak = {
            kind: 'plans',
            count: 5,
            latest: key(endsDay - 3),
            due: { period: key(endsDay - 1), endsAt: startOf(endsDay) },
          }
          const lastDay = startOf(endsDay - 1)
          const before = new Date(lastDay.getTime() - 60_000)
          expect([endsDay, streakEndsSoon(streak, before)]).toEqual([
            endsDay,
            false,
          ])
          expect([endsDay, streakEndsSoon(streak, lastDay)]).toEqual([
            endsDay,
            true,
          ])
        }
      })
    )

    it(
      'the watch’s Up Next starts an untimed Plan at its day’s start',
      inZone(() => {
        for (const nowDay of [-1, 0, 1]) {
          setNow(at(12, 0, nowDay))
          const items = buildUpNext({
            contacts: [],
            conversations: [],
            dayPlans: [0, 1, 2, 3].map((n) => ({
              id: `p${n}`,
              date: stored(nowDay + n),
              minutes: 60,
              anytime: true,
            })),
            recurringPlans: [],
            categories: [],
            includePlans: true,
          })
          expect(items.map((item) => [item.day, item.start])).toEqual(
            [0, 1, 2, 3].map((n) => [
              key(nowDay + n),
              startOf(nowDay + n).getTime(),
            ])
          )
        }
      })
    )

    it(
      'reminds to log a planned day and to plan next week at their set times',
      inZone(() => {
        for (const from of [at(9, 0, -1), at(0, 30), at(9)]) {
          const unlogged = unloggedDayReminderGroups(
            {
              dayPlans: [
                { id: 'p', date: stored(), minutes: 120, anytime: true },
                { id: 'q', date: stored(1), minutes: 120, anytime: true },
              ],
              recurringPlans: [],
              timeEntries: {},
              remindAt: 20 * 60,
              enabledAt: 0,
              tracksHoursIn: () => true,
            },
            from.getTime()
          )
          expect(
            unlogged.map(({ date, days }) => [
              moment(date).format('YYYY-MM-DD HH:mm'),
              days.map((x) => x.key),
            ])
          ).toEqual([
            [`${key(0)} 20:00`, [key(0)]],
            [`${key(1)} 20:00`, [key(1)]],
          ])
          const weekly = weekPlanReminderDates(
            {
              dayPlans: [],
              recurringPlans: [],
              offDays: [],
              weekday: moment(day).day(),
              remindAt: 18 * 60,
              enabledAt: 0,
            },
            from.getTime()
          ).map(({ date }) => moment(date).format('YYYY-MM-DD HH:mm'))
          expect(weekly).toContain(`${day} 18:00`)
          expect(weekly).toContain(`${key(7)} 18:00`)
        }
      })
    )

    it(
      'a weekly Recurring Plan falls on the day once, counted under its date',
      inZone(() => {
        const weekly: RecurringPlan = {
          id: 'w',
          startDate: stored(-28),
          minutes: 120,
          recurrence: {
            frequency: RecurringPlanFrequencies.WEEKLY,
            interval: 1,
            endDate: null,
          },
        }
        const matched: string[] = []
        for (let i = -8; i <= 8; i++)
          for (const date of [startOf(i), at(12, 0, i)])
            if (getPlansIntersectingDay(date, [weekly]).length)
              matched.push(key(i))
        expect(matched).toEqual([key(-7), key(-7), day, day, key(7), key(7)])

        const month = m - 1
        const planned = plannedMinutesThroughEachDayOfMonth(
          month,
          y,
          [],
          [weekly]
        )
        expect(planned).toHaveLength(moment(day).daysInMonth())
        expect(planned[d - 1] - (planned[d - 2] ?? 0)).toBe(120)
        expect(planned[d] - planned[d - 1]).toBe(0)
        const logged = loggedMinutesThroughEachDayOfMonth({
          month,
          year: y,
          serviceReports: {
            [y]: {
              [month]: [
                {
                  id: 'e',
                  hours: 1,
                  minutes: 0,
                  date: normalizeDateForStorage(at(0, 30)),
                },
              ],
            },
          },
          publisher: 'regularPioneer',
          creditLimit: { enabled: false, customLimitHours: 0 },
        })
        expect([logged[d - 2] ?? 0, logged[d - 1]]).toEqual([0, 60])
      })
    )
  }
)
