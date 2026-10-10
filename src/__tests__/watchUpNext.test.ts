import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  getCalendars: () => [{ uses24hourClock: false }],
}))

import { buildUpNext, BuildUpNextArgs } from '@/app/watch/buildUpNext'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import { RecurringPlanFrequencies } from '@/types/timeEntry'
import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'
import type { DayPlan, RecurringPlan } from '@/types/timeEntry'

// Monday, October 5, 2026, 9:00 local.
const NOW = new Date(2026, 9, 5, 9, 0)
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute)

const maria: Contact = {
  id: 'maria',
  name: 'Maria González',
  createdAt: new Date(2026, 0, 1),
  address: { line1: '12 Oak St', city: 'Springfield' },
  coordinate: { latitude: 40, longitude: -75 },
}

const followUp = (
  id: string,
  date: Date,
  overrides: Partial<Visit> = {}
): Visit => ({
  id,
  contact: { id: 'maria' },
  date: at(1, 10),
  isBibleStudy: false,
  followUp: { date, notifyMe: false, topic: 'Why we suffer' },
  ...overrides,
})

const dayPlan = (
  id: string,
  day: number,
  overrides: Partial<DayPlan> = {}
): DayPlan => ({
  id,
  date: normalizeDateForStorage(at(day, 12)),
  minutes: 120,
  startTimeInMinutes: 14 * 60,
  ...overrides,
})

const args = (overrides: Partial<BuildUpNextArgs> = {}): BuildUpNextArgs => ({
  contacts: [maria],
  conversations: [],
  dayPlans: [],
  recurringPlans: [],
  categories: [],
  includePlans: true,
  ...overrides,
})

describe('buildUpNext', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('describes a Follow-up with its Contact, topic and place', () => {
    const [item] = buildUpNext(
      args({ conversations: [followUp('visit', at(5, 15))] })
    )

    expect(item).toEqual({
      id: 'visit',
      kind: 'followUp',
      start: at(5, 15).getTime(),
      timed: true,
      title: 'Maria González',
      detail: 'Why we suffer',
      durationText: null,
      timeText: '3:00 PM',
      clockText: '3:00',
      periodText: 'PM',
      weekdayText: 'Mon',
      dateText: 'Oct 5',
      place: {
        name: 'Maria González',
        address: '12 Oak St Springfield',
        latitude: 40,
        longitude: -75,
      },
    })
  })

  it('shows the street when a Follow-up has no topic', () => {
    const visit = followUp('visit', at(5, 15))
    visit.followUp!.topic = undefined

    expect(buildUpNext(args({ conversations: [visit] }))[0].detail).toBe(
      '12 Oak St'
    )
  })

  it('keeps a started item for its first 15 minutes only', () => {
    const items = buildUpNext(
      args({
        conversations: [
          followUp('just-started', at(5, 8, 50)),
          followUp('overdue', at(5, 8, 40)),
        ],
      })
    )

    expect(items.map((item) => item.id)).toEqual(['just-started'])
  })

  it('leaves out dismissed, answered and far-off Follow-ups', () => {
    const dismissed = followUp('dismissed', at(5, 15))
    dismissed.followUp!.dismissed = true
    const items = buildUpNext(
      args({
        conversations: [
          dismissed,
          followUp('answered', at(5, 8, 55)),
          followUp('answer', at(5, 9, 0), {
            followUp: undefined,
            date: at(5, 9, 0),
          }),
          followUp('far', at(30, 15)),
        ],
      })
    )

    expect(items).toEqual([])
  })

  it('names a Plan by title, then Type, then "Plan"', () => {
    const items = buildUpNext(
      args({
        categories: [{ id: 'cart', name: 'Cart', isCredit: false }],
        dayPlans: [
          dayPlan('titled', 6, {
            title: 'Morning group',
            location: { name: 'Kingdom Hall' },
          }),
          dayPlan('typed', 7, { categoryId: 'cart' }),
          dayPlan('plain', 8),
        ],
      })
    )

    expect(items.map(({ title, detail }) => ({ title, detail }))).toEqual([
      { title: 'Morning group', detail: 'Kingdom Hall' },
      { title: 'Cart', detail: null },
      { title: 'plan', detail: null },
    ])
    expect(items[0]).toMatchObject({ durationText: '2h', timeText: '2:00 PM' })
  })

  it('treats a Plan without a time as spanning its day, never noon', () => {
    const [item] = buildUpNext(
      args({
        dayPlans: [dayPlan('untimed', 6, { startTimeInMinutes: undefined })],
      })
    )

    expect(item).toMatchObject({
      timed: false,
      start: new Date(2026, 9, 6).getTime(),
      timeText: null,
      clockText: null,
      periodText: null,
    })
  })

  it('shows an anytime Plan untimed, though it keeps noon for older apps', () => {
    const [item] = buildUpNext(
      args({
        dayPlans: [
          dayPlan('anytime', 6, { startTimeInMinutes: 720, anytime: true }),
        ],
      })
    )

    expect(item).toMatchObject({
      timed: false,
      start: new Date(2026, 9, 6).getTime(),
      timeText: null,
    })
  })

  it('lists each Recurring Plan instance with its own start time', () => {
    const weekly: RecurringPlan = {
      id: 'weekly',
      startDate: normalizeDateForStorage(at(5, 12)),
      minutes: 90,
      startTimeInMinutes: 18 * 60,
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: null,
      },
      overrides: [
        {
          date: normalizeDateForStorage(at(12, 12)),
          minutes: 60,
          startTimeInMinutes: 19 * 60,
        },
      ],
      deletedDates: [normalizeDateForStorage(at(19, 12))],
    }

    const items = buildUpNext(args({ recurringPlans: [weekly] }))

    expect(
      items.map(({ id, start, durationText }) => ({ id, start, durationText }))
    ).toEqual([
      {
        id: 'weekly:2026-10-05',
        start: at(5, 18).getTime(),
        durationText: '1.5h',
      },
      {
        id: 'weekly:2026-10-12',
        start: at(12, 19).getTime(),
        durationText: '1h',
      },
    ])
  })

  it('orders by day, timed before untimed, then a Follow-up first', () => {
    const items = buildUpNext(
      args({
        conversations: [followUp('visit', at(6, 14))],
        dayPlans: [
          dayPlan('untimed-today', 5, { startTimeInMinutes: undefined }),
          dayPlan('timed-today', 5, { startTimeInMinutes: 20 * 60 }),
          dayPlan('same-time', 6),
        ],
      })
    )

    expect(items.map((item) => item.id)).toEqual([
      'timed-today',
      'untimed-today',
      'visit',
      'same-time',
    ])
  })

  it('leaves out Plans for roles that don’t track hours, and empty Plans', () => {
    expect(
      buildUpNext(args({ dayPlans: [dayPlan('plan', 6)], includePlans: false }))
    ).toEqual([])
    expect(
      buildUpNext(args({ dayPlans: [dayPlan('empty', 6, { minutes: 0 })] }))
    ).toEqual([])
  })
})
