import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LocalReminder } from '@/lib/reminderSchedule'

vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  },
}))

vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
  getCalendars: () => [],
}))

vi.mock('@/lib/minutes', () => ({
  formatMinutes: (minutes: number) => ({ formatted: `${minutes}m` }),
}))

import { reminderContent } from '@/lib/reminderContent'
import { buildReminderSchedule } from '@/lib/reminderSchedule'

const anchor = new Date('2026-05-01T15:00:00Z')
const visit: LocalReminder = {
  id: 'witness-work-visit-v',
  kind: 'visit',
  targetId: 'v',
  contactId: 'c',
  anchor,
  date: new Date(anchor.getTime() - 2 * 60 * 60_000),
  name: 'Ana',
  note: 'Psalm 37',
}
const options = {
  dataProtectionMode: false,
  timeDisplayFormat: 'short' as const,
}

describe('reminderContent', () => {
  it('words a Follow-up the same way for every path, with a localized lead', () => {
    const content = reminderContent(visit, options)
    expect(content.title).toBe('reminder_title')
    expect(content.body).toContain('visitReminderBody')
    expect(content.body).toContain('"name":"Ana"')
    expect(content.body).toContain('reminderLeadHours {\\"count\\":2}')
    expect(content.body).toContain('Psalm 37')
    expect(content.data).toEqual({
      reminder: { kind: 'visit', id: 'v', contactId: 'c' },
    })
  })

  it('keeps names and topics off the lock screen in data protection mode', () => {
    const content = reminderContent(visit, {
      ...options,
      dataProtectionMode: true,
    })
    expect(content.body).toContain('visitReminderBodyPrivate')
    expect(content.body).not.toContain('Ana')
    expect(content.body).not.toContain('Psalm')
  })

  it('says "now" for a reminder at the start time', () => {
    const content = reminderContent(
      {
        ...visit,
        kind: 'plan',
        targetId: 'p',
        contactId: undefined,
        date: anchor,
        title: 'Cart',
        minutes: 90,
        note: undefined,
      },
      options
    )
    expect(content.title).toBe('Cart')
    expect(content.body).toContain('planReminderBodyNow')
    expect(content.data).toEqual({ reminder: { kind: 'plan', id: 'p' } })
  })

  it("opens a Recurring Plan's instance", () => {
    const content = reminderContent(
      {
        ...visit,
        kind: 'plan',
        targetId: 'r',
        contactId: undefined,
        day: '2026-05-01',
        minutes: 90,
      },
      options
    )
    expect(content.data).toEqual({
      reminder: { kind: 'plan', id: 'r', day: '2026-05-01' },
    })
  })

  describe('a reminder to log time', () => {
    const unlogged: LocalReminder = {
      id: 'witness-work-unloggedDay-2026-05-01',
      kind: 'unloggedDay',
      targetId: '2026-05-01',
      date: new Date(2026, 4, 1, 20),
      anchor: new Date(2026, 4, 1, 11),
      minutes: 120,
      days: ['2026-05-01'],
    }

    it('names the planned time for the same day and opens that day', () => {
      const content = reminderContent(unlogged, options)
      expect(content.title).toBe('unloggedDayReminder_title')
      expect(content.body).toBe(
        'unloggedDayReminderBodyToday {"duration":"120m"}'
      )
      expect(content.data).toEqual({
        reminder: { kind: 'unloggedDay', id: '2026-05-01' },
      })
    })

    it('says yesterday when a late plan reminds the next day', () => {
      const content = reminderContent(
        { ...unlogged, date: new Date(2026, 4, 2, 20) },
        options
      )
      expect(content.body).toContain('unloggedDayReminderBodyYesterday')
    })

    it('counts the days a combined reminder covers', () => {
      const content = reminderContent(
        { ...unlogged, days: ['2026-05-01', '2026-05-02'] },
        options
      )
      expect(content.body).toBe('unloggedDayReminderBodyDays {"count":2}')
    })
  })

  describe('a streak about to end', () => {
    const streak: LocalReminder = {
      id: 'witness-work-streak-2026-05-04',
      kind: 'streak',
      targetId: '2026-05-04',
      anchor: new Date(2026, 4, 6),
      date: new Date(2026, 4, 5, 18),
      streak: { count: 12, kind: 'plans' },
    }

    it("names the planned day and the streak, and opens that day's time", () => {
      const content = reminderContent(streak, options)
      expect(content.title).toBe('streakReminder_title')
      expect(content.body).toContain('streakReminderBodyPlans')
      expect(content.body).toContain('"count":12')
      expect(content.data).toEqual({
        reminder: { kind: 'streak', id: '2026-05-04' },
      })
    })

    it('names the month and its last day for months', () => {
      const content = reminderContent(
        {
          ...streak,
          targetId: '2026-04-01',
          anchor: new Date(2026, 5, 1),
          date: new Date(2026, 4, 28, 18),
          streak: { count: 5, kind: 'months' },
        },
        options
      )
      expect(content.body).toContain('streakReminderBodyMonths')
      expect(content.body).toContain('"month":"April"')
      expect(content.body).toContain('"count":5')
    })
  })

  describe('across a daylight saving change', () => {
    const originalTZ = process.env.TZ
    afterEach(() => {
      process.env.TZ = originalTZ
    })

    it('says a day-before Plan reminder is a day ahead, not 25 hours', () => {
      process.env.TZ = 'America/New_York'
      const [reminder] = buildReminderSchedule({
        contacts: [],
        visits: [],
        plans: [
          {
            id: 'p',
            date: new Date(Date.UTC(2026, 10, 1, 12)),
            startTimeInMinutes: 10 * 60,
            minutes: 60,
            notifyMe: true,
            notifications: [],
          },
        ],
        visitOffset: { amount: 30, unit: 'minutes' },
        planOffset: { amount: 1, unit: 'days' },
        now: new Date(2026, 0, 1).getTime(),
      })
      expect(reminderContent(reminder, options).body).toBe(
        'planReminderBody {"lead":"reminderLeadDays {\\"count\\":1}","duration":"60m"}'
      )
    })
  })

  describe('an invitation to plan next week', () => {
    const weekPlan: LocalReminder = {
      id: 'witness-work-weekPlan-2026-05-03',
      kind: 'weekPlan',
      targetId: '2026-05-03',
      anchor: new Date(2026, 4, 3),
      date: new Date(2026, 4, 2, 18),
    }

    it('invites the User to plan the week and opens it', () => {
      const content = reminderContent(weekPlan, options)
      expect(content.title).toBe('weekPlanReminder_title')
      expect(content.body).toBe('weekPlanReminderBody {"date":"May 3"}')
      expect(content.data).toEqual({
        reminder: { kind: 'weekPlan', id: '2026-05-03' },
      })
    })
  })
})
