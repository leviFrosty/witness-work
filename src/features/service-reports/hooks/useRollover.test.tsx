import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  DeviceType: { TABLET: 2 },
  deviceType: 1,
  osName: 'iOS',
}))

import useServiceReport from '@/stores/serviceReport'
import { useRollover } from '@/features/service-reports/hooks/useRollover'

let renders = 0

const Harness = () => {
  renders++
  useRollover()
  return null
}

let renderer: ReactTestRenderer | undefined
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

it('re-renders for time entries, not for Plan writes', async () => {
  await act(async () => {
    renderer = create(<Harness />)
  })
  const settled = renders

  await act(async () => {
    useServiceReport.setState({ dayPlans: [], recurringPlans: [] })
  })
  expect(renders).toBe(settled)

  await act(async () => {
    useServiceReport.setState({ serviceReports: {} })
  })
  expect(renders).toBeGreaterThan(settled)
})
