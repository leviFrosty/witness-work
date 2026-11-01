import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ServiceStreak } from '@/lib/serviceStreak'

const state = vi.hoisted(() => ({ override: null as number | null }))

vi.mock('@/hooks/usePublisher', () => ({
  default: () => ({ streakKind: 'plans' }),
}))
vi.mock('@/hooks/useToday', () => ({ default: () => new Date(2026, 9, 20) }))
vi.mock('@/stores/serviceReport', () => ({
  useServiceReport: (select: (s: object) => unknown) =>
    select({ serviceReports: {}, dayPlans: [], recurringPlans: [] }),
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: (select: (s: object) => unknown) =>
    select({ devStreakOverride: state.override }),
}))

const { default: useServiceStreak, useRecordedServiceStreak } = await import(
  '@/hooks/useServiceStreak'
)

describe('useServiceStreak', () => {
  let renderer: ReactTestRenderer | undefined

  const renders: [ServiceStreak, ServiceStreak][] = []
  const latest = () => renders[renders.length - 1]

  function Probe() {
    renders.push([useServiceStreak(), useRecordedServiceStreak()])
    return null
  }

  beforeAll(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  })
  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = undefined
    renders.length = 0
    state.override = null
  })

  it('reports the recorded streak with no override', () => {
    act(() => {
      renderer = create(<Probe />)
    })
    const [shown, recorded] = latest()
    expect(shown).toEqual(recorded)
    expect(shown.count).toBe(0)
  })

  it("reports Developer Tools' count while it's set, keeping the kind", () => {
    state.override = 14
    act(() => {
      renderer = create(<Probe />)
    })
    const [shown, recorded] = latest()
    expect(shown).toMatchObject({ kind: 'plans', count: 14 })
    expect(recorded.count).toBe(0)
  })
})
