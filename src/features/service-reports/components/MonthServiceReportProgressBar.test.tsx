import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ goalHours: 0 }))

vi.mock('react-native', () => {
  class Value {
    setValue() {}
    interpolate() {
      return 0
    }
  }
  return {
    View: 'View',
    Animated: { Value, View: 'Animated.View' },
  }
})
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: {}, numbers: { borderRadiusSm: 4 } }),
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: (select: (s: object) => unknown) =>
    select({ overrideCreditLimit: false, customCreditLimitHours: 55 }),
}))
vi.mock('@/stores/serviceReport', () => ({
  useServiceReport: () => ({ serviceReports: {} }),
}))
vi.mock('@/lib/serviceReport', () => ({
  getMonthsReports: () => [],
  adjustedMinutesForSpecificMonth: () => ({ value: 750 }),
  getTotalMinutesDetailedForSpecificMonth: () => ({
    standardWithoutOtherMinutes: 750,
    ldc: 0,
    other: { reports: [] },
  }),
}))
vi.mock('@/hooks/useMonthlyGoal', () => ({
  default: () => ({ effectiveGoalHours: mocks.goalHours }),
}))
vi.mock('@/hooks/usePublisher', () => ({
  default: () => ({ type: 'publisher' }),
}))
vi.mock('@/lib/direction', () => ({ forwardSign: () => 1 }))
vi.mock('@/hooks/useAppActive', () => ({ default: () => true }))
vi.mock('@/hooks/useShownInTab', () => ({ default: () => true }))

import MonthServiceReportProgressBar from '@/features/service-reports/components/MonthServiceReportProgressBar'

let renderer: ReactTestRenderer
const render = async (goalHours: number) => {
  mocks.goalHours = goalHours
  await act(async () => {
    renderer = create(
      <MonthServiceReportProgressBar month={9} year={2026} animated={false} />
    )
  })
}
afterEach(async () => {
  await act(async () => renderer.unmount())
})

describe('MonthServiceReportProgressBar', () => {
  it('renders nothing without a goal, rather than a full bar', async () => {
    await render(0)
    expect(renderer.toJSON()).toBeNull()
  })

  it('fills toward a goal', async () => {
    await render(25)
    expect(renderer.toJSON()).not.toBeNull()
    const fill = renderer.root.findAll(
      (node) =>
        (node.type as unknown) === 'View' &&
        node.props.style?.flexDirection === 'row' &&
        node.props.style?.width === '50%'
    )
    expect(fill).toHaveLength(1)
  })
})
