import { describe, expect, it, vi } from 'vitest'

const { i18n } = vi.hoisted(() => ({
  i18n: { current: undefined as unknown as import('i18n-js').I18n },
}))

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: enUS } = await import('@/locales/en-US.json')

  i18n.current = new I18n({
    'en-us': enUS,
    xx: {
      scheduleCalendar: {
        dayLabelDate: '[{{date}}]',
        dayLabelToday: '[today]',
        dayLabelLogged: '[{{value}} logged]',
        dayLabelPlanned: '[{{value}} planned]',
        dayLabelPlannedGoalMet: '[{{value}} planned, met]',
        dayLabelMissed: '[missed]',
        dayLabelNote: '[note]',
        dayLabelExtra: '[{{text}}]',
      },
    },
  })
  i18n.current.locale = 'en-us'
  return { default: i18n.current }
})

import {
  type CalendarDayFacts,
  calendarDayAccessibilityLabel,
} from '@/lib/calendarDayLabel'

const hours = (minutes: number) => `${minutes / 60}h`

const day = (facts: Partial<CalendarDayFacts>): CalendarDayFacts => ({
  date: 'Tuesday, March 12, 2026',
  isToday: false,
  isPast: false,
  wentInService: false,
  loggedMinutes: 0,
  hasPlan: false,
  plannedMinutes: 0,
  hasNote: false,
  ...facts,
})

describe('calendarDayAccessibilityLabel', () => {
  it('reads just the date for an empty day', () => {
    expect(calendarDayAccessibilityLabel(day({}), hours)).toBe(
      'Tuesday, March 12, 2026.'
    )
  })

  it('reads logged time against a Plan it met, with a note, today', () => {
    expect(
      calendarDayAccessibilityLabel(
        day({
          isToday: true,
          wentInService: true,
          loggedMinutes: 180,
          hasPlan: true,
          plannedMinutes: 180,
          hasNote: true,
        }),
        hours
      )
    ).toBe(
      'Tuesday, March 12, 2026. Today. Logged 3h. Planned 3h, goal met. Has a note.'
    )
  })

  it('reads a partly met Plan without "goal met"', () => {
    expect(
      calendarDayAccessibilityLabel(
        day({
          isPast: true,
          wentInService: true,
          loggedMinutes: 60,
          hasPlan: true,
          plannedMinutes: 120,
        }),
        hours
      )
    ).toBe('Tuesday, March 12, 2026. Logged 1h. Planned 2h.')
  })

  it('reads a past Plan with nothing logged as missed', () => {
    expect(
      calendarDayAccessibilityLabel(
        day({ isPast: true, hasPlan: true, plannedMinutes: 120 }),
        hours
      )
    ).toBe('Tuesday, March 12, 2026. Planned 2h. Plan missed.')
  })

  it("doesn't call today's or an upcoming Plan missed", () => {
    expect(
      calendarDayAccessibilityLabel(
        day({ isToday: true, hasPlan: true, plannedMinutes: 60 }),
        hours
      )
    ).toBe('Tuesday, March 12, 2026. Today. Planned 1h.')
    expect(
      calendarDayAccessibilityLabel(
        day({ hasPlan: true, plannedMinutes: 60 }),
        hours
      )
    ).toBe('Tuesday, March 12, 2026. Planned 1h.')
  })

  it('reads time logged without a Plan, and who the day is with', () => {
    expect(
      calendarDayAccessibilityLabel(
        day({
          isPast: true,
          wentInService: true,
          loggedMinutes: 120,
          extra: 'With Sam',
        }),
        hours
      )
    ).toBe('Tuesday, March 12, 2026. Logged 2h. With Sam.')
  })

  it("doesn't double the period after an abbreviated unit", () => {
    const abbreviated = (minutes: number) => `${minutes / 60} Std.`
    expect(
      calendarDayAccessibilityLabel(
        day({
          isPast: true,
          wentInService: true,
          loggedMinutes: 60,
          hasPlan: true,
          plannedMinutes: 120,
        }),
        abbreviated
      )
    ).toBe('Tuesday, March 12, 2026. Logged 1 Std. Planned 2 Std.')
  })

  it('builds every part from the Language, not English', () => {
    i18n.current.locale = 'xx'
    try {
      expect(
        calendarDayAccessibilityLabel(
          day({
            isToday: true,
            wentInService: true,
            loggedMinutes: 120,
            hasPlan: true,
            plannedMinutes: 60,
            hasNote: true,
            extra: 'Sam',
          }),
          hours
        )
      ).toBe(
        '[Tuesday, March 12, 2026] [today] [2h logged] [1h planned, met] [note] [Sam]'
      )
    } finally {
      i18n.current.locale = 'en-us'
    }
  })
})
