import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import type { ServiceYearPaceData } from '@/features/progress/lib/serviceYearPaceData'

const runtime = vi.hoisted(() => ({
  foreground: new Set<() => void>(),
}))

const stores = vi.hoisted(() => ({
  serviceReport: { serviceReports: {}, dayPlans: [], recurringPlans: [] },
  categories: { categories: [] },
  preferences: {
    role: 'regularPioneer',
    roleHistory: null,
    publisherHours: {
      publisher: 0,
      regularAuxiliary: 30,
      regularPioneer: 50,
      circuitOverseer: 50,
      specialPioneer: 100,
      custom: 50,
    },
    userSpecifiedHasAnnualGoal: 'default',
    milestoneOverrides: null,
    overrideCreditLimit: false,
    customCreditLimitHours: 55,
    logsHours: true,
    monthlyGoalOverrides: {},
  },
}))

vi.mock('@/stores/serviceReport', () => ({
  default: (select: (s: typeof stores.serviceReport) => unknown) =>
    select(stores.serviceReport),
}))
vi.mock('@/stores/categories', () => ({
  default: (select: (s: typeof stores.categories) => unknown) =>
    select(stores.categories),
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: (select: (s: typeof stores.preferences) => unknown) =>
    select(stores.preferences),
}))
vi.mock('@/lib/appLifecycle', () => ({
  addForegroundListener: (listener: () => void) => {
    runtime.foreground.add(listener)
    return { remove: () => runtime.foreground.delete(listener) }
  },
}))
vi.mock('@/lib/deviceTimeZone', () => ({ refreshLocalTimeOffset: () => {} }))

import useServiceYearPace from '@/features/progress/hooks/useServiceYearPace'

const seen: ServiceYearPaceData[] = []
const latest = () => seen[seen.length - 1]
function Probe() {
  seen.push(useServiceYearPace(2026))
  return null
}

let root: ReactTestRenderer | undefined
beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
})
afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  seen.length = 0
  vi.useRealTimers()
})

it('moves the Year views to the next day at midnight', () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })

  vi.setSystemTime(new Date(2026, 9, 20, 23, 59))
  act(() => {
    root = create(<Probe />)
  })
  const before = latest()
  expect(before.today.getDate()).toBe(20)

  act(() => {
    vi.advanceTimersByTime(2 * 60_000)
  })

  expect(latest().today.getDate()).toBe(21)
  expect(latest().pace).not.toBe(before.pace)
})

it('moves to the new day when the app comes back on one', () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(new Date(2026, 9, 20, 21, 0))
  act(() => {
    root = create(<Probe />)
  })
  const before = latest()

  act(() => runtime.foreground.forEach((listener) => listener()))
  expect(latest().today).toBe(before.today)
  expect(latest().pace).toBe(before.pace)

  vi.setSystemTime(new Date(2026, 9, 21, 8, 0))
  act(() => runtime.foreground.forEach((listener) => listener()))
  expect(latest().today.getDate()).toBe(21)
  expect(latest().pace).not.toBe(before.pace)
})
