import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  focused: true,
  minutes: 0,
  reports: { serviceReports: {} },
  roleFor: () => 'regularPioneer',
  fire: vi.fn(),
  fireworks: { fire: () => runtime.fire() },
  sealScale: { value: 1 },
  heavy: vi.fn(),
  light: vi.fn(),
}))

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
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
  getCalendars: () => [{ uses24hourClock: false, firstWeekday: 1 }],
}))
vi.mock('react-native', () => ({ View: 'View', Pressable: 'Pressable' }))
vi.mock('@/hooks/useAccessibilityTextSize', () => ({
  default: () => false,
  FIT_ONE_LINE: {},
}))
vi.mock('react-native-reanimated', () => ({
  default: { View: 'AnimatedView' },
  useSharedValue: () => runtime.sealScale,
  useAnimatedStyle: () => ({}),
  withSequence: () => 1,
  withTiming: () => 1,
}))
vi.mock('@react-navigation/native', () => ({
  useIsFocused: () => runtime.focused,
}))
vi.mock('lucide-react-native', () => ({ Crown: 'Crown', Star: 'Star' }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: {},
    fonts: {},
    numbers: {},
    fontSize: () => 14,
  }),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/tracking', () => ({ tracking: (value: number) => value }))
vi.mock('@/hooks/usePublisher', () => ({
  default: () => ({ type: 'regularPioneer', annualGoalHours: 600 }),
}))
vi.mock('@/hooks/useRoleForMonth', () => ({
  default: () => runtime.roleFor,
}))
vi.mock('@/stores/serviceReport', () => ({
  default: () => runtime.reports,
}))
vi.mock('@/lib/serviceReport', () => ({
  getTotalMinutesForServiceYear: () => runtime.minutes,
}))
vi.mock('@/hooks/useFireworks', () => ({
  default: () => runtime.fireworks,
}))
vi.mock('@/lib/haptics', () => ({
  default: { heavy: runtime.heavy, light: runtime.light },
}))
vi.mock('@/components/ui/LucideIcon', () => ({ default: 'LucideIcon' }))
vi.mock('@/components/ui/DirectionalIcon', () => ({
  ChevronForwardIcon: 'ChevronForwardIcon',
}))
vi.mock('@/components/ui/Card', () => ({ default: 'Card' }))
vi.mock('@/components/ui/Chip', () => ({ default: 'Chip' }))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/components/ui/PointerHover', () => ({ default: 'PointerHover' }))
vi.mock('@/components/ui/ContextMenu', () => ({ default: 'ContextMenu' }))
vi.mock('@/components/MilestoneProgressBar', () => ({
  default: 'MilestoneProgressBar',
}))

import YearMilestoneCard from '@/components/YearMilestoneCard'
import { usePreferences } from '@/stores/preferences'

const currentYear = () => {
  const now = new Date()
  return now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear()
}

const bannerShown = (renderer: ReactTestRenderer) =>
  renderer.root
    .findAllByType('Text' as never)
    .some((node) => node.props.children === 'milestoneJustHitBanner')

describe('YearMilestoneCard celebration', () => {
  let renderer: ReactTestRenderer | undefined

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    runtime.focused = true
    runtime.minutes = 0
    runtime.fire.mockClear()
    runtime.heavy.mockClear()
    runtime.light.mockClear()
    usePreferences.getState().set({ celebratedMilestones: {} })
  })
  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = undefined
  })

  const render = () => {
    const year = currentYear()
    act(() => {
      renderer = create(<YearMilestoneCard year={year} />)
    })
    return () => act(() => renderer!.update(<YearMilestoneCard year={year} />))
  }

  it('fires the annual-goal burst once, not on every refocus', () => {
    runtime.minutes = 600 * 60
    const rerender = render()

    expect(runtime.heavy).toHaveBeenCalledTimes(1)
    expect(runtime.fire).toHaveBeenCalledTimes(1)
    expect(
      usePreferences.getState().celebratedMilestones[String(currentYear() - 1)]
    ).toEqual([30, 50, 100, 200, 350, 600])

    runtime.focused = false
    rerender()
    runtime.focused = true
    rerender()

    expect(runtime.heavy).toHaveBeenCalledTimes(1)
    expect(runtime.fire).toHaveBeenCalledTimes(1)
  })

  it('keeps the milestone banner for the visit and drops it on return', () => {
    runtime.minutes = 120 * 60
    const rerender = render()

    expect(runtime.light).toHaveBeenCalledTimes(1)
    expect(bannerShown(renderer!)).toBe(true)

    runtime.focused = false
    rerender()
    runtime.focused = true
    rerender()

    expect(runtime.light).toHaveBeenCalledTimes(1)
    expect(bannerShown(renderer!)).toBe(false)
  })

  it('celebrates a milestone crossed while the screen stays mounted', () => {
    runtime.minutes = 60 * 60
    const rerender = render()
    expect(runtime.light).toHaveBeenCalledTimes(1)

    runtime.focused = false
    rerender()

    runtime.reports = { serviceReports: {} }
    runtime.minutes = 120 * 60
    runtime.focused = true
    rerender()

    expect(runtime.light).toHaveBeenCalledTimes(2)
    expect(bannerShown(renderer!)).toBe(true)
  })

  it('reads the hero as one phrase against the annual goal', () => {
    runtime.minutes = 90
    render()

    expect(
      renderer!.root.findAll(
        (node) =>
          (node.type as unknown) === 'View' &&
          node.props.accessibilityLabel === 'durationSpoken.ofGoal'
      )
    ).toHaveLength(1)
  })
})
