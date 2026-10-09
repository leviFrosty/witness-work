import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import { RecurringPlanFrequencies, type RecurringPlan } from '@/lib/recurrence'
import type { DayPlan } from '@/types/timeEntry'

const alert = vi.fn()
vi.mock('react-native', () => ({
  Alert: { alert: (...args: unknown[]) => alert(...args) },
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/dates', () => ({
  formatStartTime: (minutes: number) => `${minutes}m`,
}))
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, params?: object) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
  },
}))
vi.mock('@/features/buddies/lib/buddyProfile', () => ({
  buddyDisplayName: (buddy: { name: string }) => buddy.name,
}))

const day = (iso: string) => normalizeDateForStorage(`${iso}T12:00:00`)
const serviceReport = {
  dayPlans: [] as DayPlan[],
  recurringPlans: [] as RecurringPlan[],
  deleteDayPlan: vi.fn(),
  deleteSingleEventFromRecurringPlan: vi.fn(),
}
vi.mock('@/stores/serviceReport', () => ({
  useServiceReport: { getState: () => serviceReport },
}))
const share = {
  from: 'marco',
  shareId: 's',
  type: 'plan',
  details: { d: '2026-10-23', s: 630, m: 90 },
}
vi.mock('@/features/buddies/stores/buddiesStore', () => ({
  useBuddies: {
    getState: () => ({
      incomingShares: { key: share },
      buddies: [{ inboxId: 'marco', name: 'Marco' }],
    }),
  },
}))

const { default: offerReplaceOverlappingPlans } = await import(
  '@/features/buddies/lib/offerReplaceOverlappingPlans'
)

const weekly = (id: string, startTimeInMinutes: number): RecurringPlan => ({
  id,
  startDate: day('2026-10-02'),
  minutes: 120,
  startTimeInMinutes,
  recurrence: {
    frequency: RecurringPlanFrequencies.WEEKLY,
    interval: 1,
    endDate: null,
  },
})

type AlertButton = { text: string; onPress: () => void }
const lastButtons = () => alert.mock.calls.at(-1)?.[2] as AlertButton[]

beforeEach(() => {
  alert.mockClear()
  serviceReport.deleteDayPlan.mockClear()
  serviceReport.deleteSingleEventFromRecurringPlan.mockClear()
  serviceReport.dayPlans = []
  serviceReport.recurringPlans = []
})

describe('offerReplaceOverlappingPlans', () => {
  it('offers to replace an overlapping recurring instance for that day only', () => {
    serviceReport.recurringPlans = [
      weekly('morning', 600),
      weekly('study', 1080),
    ]
    offerReplaceOverlappingPlans('key')

    expect(alert).toHaveBeenCalledTimes(1)
    expect(alert.mock.calls[0][1]).toContain('buddies_replaceRecurringPlanBody')
    expect(alert.mock.calls[0][1]).toContain('"name":"Marco"')
    lastButtons()
      .find((button) => button.text === 'buddies_replacePlan')!
      .onPress()
    expect(
      serviceReport.deleteSingleEventFromRecurringPlan
    ).toHaveBeenCalledTimes(1)
    const [id, date] =
      serviceReport.deleteSingleEventFromRecurringPlan.mock.calls[0]
    expect(id).toBe('morning')
    expect((date as Date).getDate()).toBe(23)
  })

  it('keeps both on Keep Both', () => {
    serviceReport.dayPlans = [
      {
        id: 'own',
        date: day('2026-10-23'),
        minutes: 60,
        startTimeInMinutes: 660,
      },
    ]
    offerReplaceOverlappingPlans('key')
    expect(alert.mock.calls[0][1]).toContain('buddies_replacePlanBody')
    lastButtons()
      .find((button) => button.text === 'buddies_keepBoth')!
      .onPress()
    expect(serviceReport.deleteDayPlan).not.toHaveBeenCalled()
  })

  it('stays quiet when nothing overlaps', () => {
    serviceReport.recurringPlans = [weekly('study', 1080)]
    offerReplaceOverlappingPlans('key')
    expect(alert).not.toHaveBeenCalled()
  })
})
