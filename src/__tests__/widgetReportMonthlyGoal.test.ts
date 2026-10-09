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
import type { PublisherHours } from '@/types/publisher'

const publisherHours: PublisherHours = {
  publisher: 0,
  regularAuxiliary: 30,
  regularPioneer: 50,
  circuitOverseer: 50,
  specialPioneer: 100,
  custom: 50,
}

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
