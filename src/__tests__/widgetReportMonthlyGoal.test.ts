import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/locales', () => ({
  default: { t: (key: string) => key },
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: () => ({ timeDisplayFormat: 'decimal' }),
}))

import { buildReport, type BuildReportArgs } from '@/app/widgets/buildReport'
import { monthlyGoalKey } from '@/lib/monthlyGoals'
import { getStudiesForGivenMonth } from '@/lib/contacts'
import type { Contact } from '@/types/contact'
import type { PublisherHours } from '@/types/publisher'

const publisherHours: PublisherHours = {
  publisher: 0,
  regularAuxiliary: 30,
  regularPioneer: 50,
  circuitOverseer: 50,
  specialPioneer: 100,
  custom: 50,
}

const contact = (id: string): Contact => ({
  id,
  name: id,
  createdAt: new Date(2026, 0, 1),
})

const baseArgs = (): BuildReportArgs => ({
  serviceReports: {
    2026: {
      6: [
        {
          id: 'july-entry',
          date: new Date(2026, 6, 5, 12),
          hours: 30,
          minutes: 0,
          credit: false,
        },
      ],
    },
  },
  publisher: 'regularPioneer',
  publisherHours,
  monthlyGoalOverrides: {},
  overrideCreditLimit: false,
  customCreditLimitHours: 55,
  timeDisplayFormat: 'decimal',
  dayPlans: [],
  recurringPlans: [],
  contacts: [],
  conversations: [],
})

describe('widget Monthly Goal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 9, 12))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the override for the current calendar month', () => {
    const args = baseArgs()
    args.monthlyGoalOverrides = {
      [monthlyGoalKey({ year: 2026, month: 6 })]: 60,
    }

    const report = buildReport(args)

    expect(report.goalHours).toBe(60)
    expect(report.progress).toBe(0.5)
  })

  it('reports a 0-hour goal as no goal, so the widget hides the goal and bar', () => {
    const args = baseArgs()
    args.monthlyGoalOverrides = {
      [monthlyGoalKey({ year: 2026, month: 6 })]: 0,
    }

    const report = buildReport(args)

    expect(report.goalHours).toBe(0)
    expect(report.progress).toBe(0)
    expect(report.hoursPerDayNeeded).toBeNull()
  })

  it('ignores overrides belonging to another month', () => {
    const args = baseArgs()
    args.monthlyGoalOverrides = {
      [monthlyGoalKey({ year: 2026, month: 7 })]: 60,
    }

    const report = buildReport(args)

    expect(report.goalHours).toBe(50)
    expect(report.progress).toBe(0.6)
  })

  it('paces against time and plans through today, like the Schedule screen', () => {
    const args = baseArgs()
    args.serviceReports[2026][6].push({
      id: 'later-in-july',
      date: new Date(2026, 6, 20, 12),
      hours: 5,
      minutes: 0,
      credit: false,
    })
    args.dayPlans = [
      { id: 'early-plan', date: new Date(2026, 6, 2), minutes: 20 * 60 },
      { id: 'later-plan', date: new Date(2026, 6, 25), minutes: 8 * 60 },
    ]

    const report = buildReport(args)

    expect(report.aheadBehindMinutes).toBe(10 * 60)
  })

  it('keeps one encouragement phrase all day, so an unchanged widget is not rewritten', () => {
    const phrases = new Set(
      [9, 12, 18, 23].map((hour) => {
        vi.setSystemTime(new Date(2026, 6, 9, hour))
        return buildReport(baseArgs()).encouragementPhrase
      })
    )
    expect(phrases.size).toBe(1)
  })
})

describe('widget month counts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 9, 12))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("counts the User's own Visits and studies, not a shared contact's", () => {
    const args = baseArgs()
    args.contacts = [contact('ada'), contact('dee')]
    args.conversations = [
      {
        id: 'own',
        contact: { id: 'ada' },
        date: new Date(2026, 6, 3, 10),
        isBibleStudy: true,
      },
      {
        id: 'received-study',
        contact: { id: 'dee' },
        date: new Date(2026, 6, 4, 10),
        isBibleStudy: true,
        receivedAt: 1,
      },
      {
        id: 'received-visit',
        contact: { id: 'dee' },
        date: new Date(2026, 6, 5, 10),
        isBibleStudy: false,
        receivedAt: 1,
      },
    ]

    const report = buildReport(args)

    expect(report.monthConversationCount).toBe(1)
    expect(report.monthBibleStudyCount).toBe(1)
  })

  it('leaves Not at Home out of the conversation count', () => {
    const args = baseArgs()
    args.contacts = [contact('ada'), contact('bo')]
    args.conversations = [
      {
        id: 'talked',
        contact: { id: 'ada' },
        date: new Date(2026, 6, 3, 10),
        isBibleStudy: false,
      },
      {
        id: 'nobody-home',
        contact: { id: 'bo' },
        date: new Date(2026, 6, 4, 10),
        isBibleStudy: false,
        notAtHome: true,
      },
    ]

    expect(buildReport(args).monthConversationCount).toBe(1)
  })

  it("counts Visits from the month's first instant through its last, saved or rehydrated", () => {
    const args = baseArgs()
    args.contacts = [contact('ada')]
    const visit = (id: string, date: Date | string) => ({
      id,
      contact: { id: 'ada' },
      date: date as Date,
      isBibleStudy: false,
    })
    args.conversations = [
      visit('june-last', new Date(2026, 5, 30, 23, 59, 59, 999)),
      visit('july-first', new Date(2026, 6, 1, 0, 0, 0, 0)),
      // Rehydrated state holds ISO strings.
      visit('july-mid', new Date(2026, 6, 15, 9).toISOString()),
      visit('july-last', new Date(2026, 6, 31, 23, 59, 59, 999).toISOString()),
      visit('august-first', new Date(2026, 7, 1, 0, 0, 0, 0)),
    ]

    expect(buildReport(args).monthConversationCount).toBe(3)
  })

  it('counts studies as the Service Report does', () => {
    const args = baseArgs()
    // `cy` was archived after this month's study; the report no longer counts
    // it, so the widget doesn't either.
    args.contacts = [contact('ada')]
    args.conversations = [
      {
        id: 'ada-study',
        contact: { id: 'ada' },
        date: new Date(2026, 6, 3, 10),
        isBibleStudy: true,
      },
      {
        id: 'cy-study',
        contact: { id: 'cy' },
        date: new Date(2026, 6, 4, 10),
        isBibleStudy: true,
      },
    ]

    const report = buildReport(args)

    expect(report.monthBibleStudyCount).toBe(
      getStudiesForGivenMonth({
        contacts: args.contacts,
        conversations: args.conversations,
        month: new Date(),
      })
    )
    expect(report.monthBibleStudyCount).toBe(1)
  })
})
