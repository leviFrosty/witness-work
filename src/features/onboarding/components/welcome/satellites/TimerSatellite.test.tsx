import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ focused: true, appActive: true }))

vi.mock('react-native', () => ({ Text: 'Text', View: 'View' }))
vi.mock('react-native-reanimated', () => ({
  default: { View: 'Animated.View' },
  useAnimatedStyle: () => ({}),
}))
vi.mock('@react-navigation/native', () => ({
  useIsFocused: () => mocks.focused,
}))
vi.mock('@/hooks/useAppActive', () => ({ default: () => mocks.appActive }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: { accent: 'blue' }, fonts: {} }),
}))
vi.mock('@/features/service-reports/hooks/useStopWatch', () => ({
  formatMs: (ms: number) => String(ms / 1000),
}))
vi.mock(
  '@/features/onboarding/components/welcome/satellites/SatelliteSurface',
  () => ({
    default: ({ children }: { children: React.ReactNode }) => children,
  })
)
vi.mock('@/lib/tracking', () => ({ tracking: (value: number) => value }))

import TimerSatellite from './TimerSatellite'

const STARTED_SECONDS = 84 * 60 + 7

let root: ReactTestRenderer | undefined
const props = {
  palette: { text: 'black' },
  focus: { value: 0 },
  active: false,
  reduceMotion: false,
  time: { value: 0 },
} as unknown as React.ComponentProps<typeof TimerSatellite>

const render = async () => {
  await act(async () => {
    if (root) root.update(<TimerSatellite {...props} />)
    else root = create(<TimerSatellite {...props} />)
  })
}
const shown = () =>
  Number(root!.root.findByType('Text' as never).props.children)
const wait = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  mocks.focused = true
  mocks.appActive = true
})
afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  vi.useRealTimers()
})

it('ticks only while Welcome shows and the app is in the foreground', async () => {
  await render()
  await wait(3000)
  expect(shown()).toBe(STARTED_SECONDS + 3)

  mocks.appActive = false
  await render()
  await wait(5000)
  expect(shown()).toBe(STARTED_SECONDS + 3)

  mocks.appActive = true
  mocks.focused = false
  await render()
  await wait(5000)
  expect(shown()).toBe(STARTED_SECONDS + 3)

  mocks.focused = true
  await render()
  await wait(1000)
  expect(shown()).toBe(STARTED_SECONDS + 4)
})
