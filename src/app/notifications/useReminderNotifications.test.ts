import { describe, expect, it, vi } from 'vitest'
import type { Visit } from '@/types/visit'

vi.mock('@/stores/contactsStore', () => ({ default: vi.fn() }))
vi.mock('@/stores/conversationStore', () => ({ default: vi.fn() }))
vi.mock('@/stores/serviceReport', () => ({ default: vi.fn() }))
vi.mock('@/stores/preferences', () => ({
  usePreferences: vi.fn(),
  DEFAULT_PLAN_NOTIFICATION_OFFSET: { amount: 30, unit: 'minutes' },
  DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET: { amount: 30, unit: 'minutes' },
}))
vi.mock('@/app/notifications/reminderTargets', () => ({
  openReminderTarget: vi.fn(),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/minutes', () => ({ formatMinutes: () => ({ formatted: '' }) }))
vi.mock('@/lib/dates', () => ({
  formatTime: () => '3:00 PM',
  formatWeekdayMonthDayCompact: () => 'Fri, May 1',
}))
vi.mock('lucide-react-native', () => ({
  BellRing: 'BellRing',
  CalendarClock: 'CalendarClock',
  ClockAlert: 'ClockAlert',
  UserCheck: 'UserCheck',
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

import {
  firedReminders,
  reminderTrayId,
} from '@/app/notifications/useReminderNotifications'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import type { UnloggedDaySources } from '@/lib/unloggedDayReminders'

const HOUR = 60 * 60_000
const start = Date.UTC(2026, 4, 1, 15)
const contacts = [{ id: 'c', name: 'Ana', createdAt: new Date() }]
const followUp: Visit = {
  id: 'v',
  date: new Date(start - 72 * HOUR),
  isBibleStudy: false,
  contact: { id: 'c' },
  followUp: {
    date: new Date(start),
    notifyMe: true,
    reminderOffsetMinutes: 60,
  },
}
const args = (now: number, visits: Visit[] = [followUp]) => ({
  contacts,
  visits,
  plans: [],
  visitOffset: { amount: 30, unit: 'minutes' as const },
  planOffset: { amount: 30, unit: 'minutes' as const },
  now,
})

describe('firedReminders', () => {
  it('lists a Follow-up reminder from when it fires until the missed item', () => {
    expect(firedReminders(args(start - 2 * HOUR))).toEqual([])
    const [fired] = firedReminders(args(start - HOUR))
    expect(reminderTrayId(fired)).toBe(`reminder:visit:v:${start - HOUR}`)
    expect(firedReminders(args(start + 3 * HOUR))).toHaveLength(1)
    expect(firedReminders(args(start + 4 * HOUR))).toEqual([])
  })

  it('drops a Follow-up reminder once the Visit happened', () => {
    const logged: Visit = {
      id: 'next',
      date: new Date(start),
      isBibleStudy: false,
      contact: { id: 'c' },
    }
    expect(firedReminders(args(start + HOUR, [followUp, logged]))).toEqual([])
  })

  it('lists a reminder whether or not system alerts were allowed', () => {
    // Nothing here reads OS permission: the tray mirrors intent.
    expect(firedReminders(args(start - 30 * 60_000))).toHaveLength(1)
  })
})

describe('reminders to log time', () => {
  const DAY = 24 * HOUR
  const remindsAt = new Date(2026, 4, 1, 20).getTime()
  const unloggedDays = (
    overrides: Partial<UnloggedDaySources> = {}
  ): UnloggedDaySources => ({
    dayPlans: [
      {
        id: 'p',
        date: normalizeDateForStorage(new Date(2026, 4, 1, 12)),
        minutes: 60,
        startTimeInMinutes: 9 * 60,
      },
    ],
    recurringPlans: [],
    timeEntries: {},
    remindAt: 20 * 60,
    enabledAt: 0,
    tracksHoursIn: () => true,
    ...overrides,
  })
  const fired = (now: number, overrides?: Partial<UnloggedDaySources>) =>
    firedReminders({
      ...args(now, []),
      unloggedDays: unloggedDays(overrides),
    })

  it('lists a planned day for a week after its reminder', () => {
    expect(fired(remindsAt - 1)).toEqual([])
    const [reminder] = fired(remindsAt)
    expect(reminderTrayId(reminder)).toBe(
      `reminder:unloggedDay:2026-05-01:${remindsAt}`
    )
    expect(fired(remindsAt + 7 * DAY - 1)).toHaveLength(1)
    expect(fired(remindsAt + 7 * DAY)).toEqual([])
  })

  it('leaves the tray once the day has time', () => {
    const date = normalizeDateForStorage(new Date(2026, 4, 1, 12))
    expect(
      fired(remindsAt + HOUR, {
        timeEntries: {
          [date.getUTCFullYear()]: {
            [date.getUTCMonth()]: [{ id: 'e', hours: 1, minutes: 0, date }],
          },
        },
      })
    ).toEqual([])
  })
})
