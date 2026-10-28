import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('react-native-mmkv', () => ({ MMKV: class {} }))
vi.mock('@/stores/preferences', async () => ({
  usePreferences: (await import('zustand')).create(() => ({
    role: 'regularPioneer',
    roleHistory: undefined,
    showStreaks: true,
  })),
}))
vi.mock('@/stores/serviceReport', async () => ({
  useServiceReport: (await import('zustand')).create(() => ({
    serviceReports: {},
    dayPlans: [],
    recurringPlans: [],
  })),
}))
vi.mock('@/stores/conversationStore', async () => ({
  default: (await import('zustand')).create(() => ({ conversations: [] })),
}))

import usePet from '@/stores/pet'
import { useServiceReport } from '@/stores/serviceReport'
import type { TimeEntry } from '@/types/timeEntry'
import { PET_RECORD_ID, type PetRecord } from '@/types/pet'
import { petEarningsNow } from '@/features/pet/lib/walletNow'

const PET: PetRecord = {
  id: PET_RECORD_ID,
  species: 'dog',
  coat: 'gold',
  adoptedOn: '2026-10-01',
  wakes: [],
  keepsakes: [],
  updatedAt: 1,
}

/** An hour on each of these October days. */
const october = (...days: number[]) => ({
  2026: {
    9: days.map(
      (day): TimeEntry => ({
        id: `${day}`,
        hours: 1,
        minutes: 0,
        date: new Date(Date.UTC(2026, 9, day, 12)),
      })
    ),
  },
})

describe('petEarningsNow', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 21, 12))
    usePet.setState({ pet: { ...PET }, room: null })
    useServiceReport.setState({ serviceReports: {}, dayPlans: [] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is null without a pet', () => {
    usePet.setState({ pet: null })
    expect(petEarningsNow()).toBeNull()
  })

  it('is what the pet has earned, and by what', () => {
    useServiceReport.setState({
      serviceReports: october(7, 8, 9),
      dayPlans: [7, 8, 9].map((day) => ({
        id: `plan-${day}`,
        date: new Date(Date.UTC(2026, 9, day, 12)),
        minutes: 60,
      })),
    })
    const now = petEarningsNow()
    expect(now?.earned).toMatchObject({
      daysOut: 3,
      plansKept: 3,
      milestones: [{ count: 3, on: '2026-10-09' }],
    })
    expect(now?.wallet).toBe(3 + 3 + 10)
  })

  it('takes off what was spent, so an overspent pet stays at 0', () => {
    usePet.setState({
      pet: {
        ...PET,
        purchases: [{ item: 'hat:cap', price: 12, on: '2026-10-08' }],
      },
    })
    useServiceReport.setState({ serviceReports: october(7, 8, 9) })
    expect(petEarningsNow()?.wallet).toBe(0)
    useServiceReport.setState({
      serviceReports: october(...Array.from({ length: 14 }, (_, i) => i + 7)),
    })
    expect(petEarningsNow()?.wallet).toBe(2)
  })
})
