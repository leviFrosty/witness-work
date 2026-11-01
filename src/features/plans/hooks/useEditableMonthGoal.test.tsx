import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('@/stores/preferences', async () => {
  const { create } = await import('zustand')
  return {
    usePreferences: create(() => ({
      role: 'publisher',
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
      customCreditLimitHours: 0,
      logsHours: false,
      timeDisplayFormat: 'decimal',
      scheduleIntroSeen: false,
      onboardingComplete: false,
    })),
  }
})

import useEditableMonthGoal from '@/features/plans/hooks/useEditableMonthGoal'
import { usePreferences } from '@/stores/preferences'

const initial = usePreferences.getState()
const renders: ReturnType<typeof useEditableMonthGoal>[] = []
const Harness = () => {
  renders.push(useEditableMonthGoal())
  return null
}
const editable = () => renders[renders.length - 1]

let root: ReactTestRenderer
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 20))
  usePreferences.setState(initial, true)
  renders.length = 0
  act(() => {
    root = create(<Harness />)
  })
})
afterEach(() => {
  act(() => root.unmount())
  vi.useRealTimers()
})

it('does not re-render on preference writes it does not read', () => {
  act(() => {
    usePreferences.setState({ timeDisplayFormat: 'short' })
  })
  act(() => {
    usePreferences.setState({ scheduleIntroSeen: true })
  })
  act(() => {
    usePreferences.setState({ onboardingComplete: true })
  })
  expect(renders).toHaveLength(1)
})

it('re-renders when the role changes, and follows it', () => {
  const october = { year: 2026, month: 9 }
  expect(editable()(october)).toBe(false)

  act(() => {
    usePreferences.setState({ role: 'regularPioneer' })
  })

  expect(renders).toHaveLength(2)
  expect(editable()(october)).toBe(true)
  expect(editable()({ year: 2026, month: 10 })).toBe(true)
  expect(editable()({ year: 2026, month: 8 })).toBe(false)
})

it('re-renders when the monthly goal hours change', () => {
  act(() => {
    usePreferences.setState({
      publisherHours: { ...initial.publisherHours, publisher: 10 },
    })
  })
  expect(renders).toHaveLength(2)
  expect(editable()({ year: 2026, month: 9 })).toBe(true)
})
