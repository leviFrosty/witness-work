import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

const daily = vi.hoisted(() => ({ reads: 0 }))

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: en } = await import('@/locales/en-US.json')
  const i18n = new I18n({ en }, { locale: 'en' })
  return { default: i18n, _i18n: i18n }
})
vi.mock('react-native', () => ({
  I18nManager: { isRTL: false },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StatusBar: 'StatusBar',
  View: 'View',
  useWindowDimensions: () => ({ width: 400, height: 800 }),
}))
vi.mock('react-native-reanimated', () => ({
  default: { View: 'AnimatedView' },
  interpolate: () => 0,
  useAnimatedStyle: () => ({}),
  useSharedValue: (value: number) => ({ value }),
  withSpring: (value: number) => value,
  withTiming: (value: number) => value,
}))
vi.mock('react-native-worklets', () => ({ scheduleOnRN: () => {} }))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {} }),
}))
vi.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: (_, name) => String(name), has: () => true })
)
vi.mock('@/components/ui/FullWindowOverlay', () => ({
  default: 'FullWindowOverlay',
}))
vi.mock('@/contexts/theme', () => {
  const theme = { colors: {}, fonts: {}, numbers: {} }
  return { default: () => theme }
})
vi.mock('@/stores/preferences', () => ({
  usePreferences: (select: (s: object) => unknown) =>
    select({ tenureStartDate: undefined }),
}))
vi.mock('@/hooks/usePublisher', () => ({
  default: () => ({
    type: 'publisher',
    tracksTenure: false,
    entryMode: 'hours',
  }),
}))
vi.mock('@/hooks/useIsSupporter', () => ({ default: () => ({ since: null }) }))
vi.mock('@/stores/conversationStore', () => ({
  default: (select: (s: object) => unknown) => select({ conversations: [] }),
}))
vi.mock('@/features/profile/hooks/useDailyMinutes', () => ({
  default: () => {
    daily.reads++
    return new Map([['2026-10-01', 90]])
  },
}))
vi.mock('@/lib/minutes', () => ({
  useFormattedMinutes: (minutes: number) => ({ formatted: `${minutes}m` }),
}))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/components/ui/IconButton', () => ({ default: 'IconButton' }))
vi.mock('@/features/profile/components/ProfileCard', () => ({
  default: 'ProfileCard',
}))
vi.mock('@/features/profile/components/ContributionGraph', () => ({
  default: 'ContributionGraph',
}))
vi.mock('@/features/profile/components/MonthlyRoutine', () => ({
  default: 'MonthlyRoutine',
}))
vi.mock('@/features/profile/components/SinceBadge', () => ({
  default: 'SinceBadge',
}))
vi.mock('@/features/profile/components/ProfileBadgesSection', () => ({
  default: 'ProfileBadgesSection',
}))

import ProfileDetailOverlay from '@/features/profile/components/ProfileDetailOverlay'
import { useProfileOverlay } from '@/stores/profileOverlay'

const origin = { x: 10, y: 20, width: 32, height: 32 }

let renderer: ReactTestRenderer | undefined
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  daily.reads = 0
  useProfileOverlay.setState({ origin: null, open: false, away: false })
})

describe('ProfileDetailOverlay', () => {
  it('computes nothing until the header hands it an origin', () => {
    act(() => {
      renderer = create(<ProfileDetailOverlay />)
    })
    expect(renderer!.toJSON()).toBeNull()
    expect(daily.reads).toBe(0)

    act(() => useProfileOverlay.getState().setOrigin(origin))
    expect(daily.reads).toBeGreaterThan(0)
    const overlay = renderer!.root.findByType('FullWindowOverlay' as never)
    expect(overlay.props.open).toBe(false)
    expect(renderer!.root.findByType('ContributionGraph' as never)).toBeTruthy()
  })

  it('opens straight from the account menu before any idle origin', () => {
    act(() => {
      renderer = create(<ProfileDetailOverlay />)
    })
    act(() => useProfileOverlay.getState().show(origin))
    const overlay = renderer!.root.findByType('FullWindowOverlay' as never)
    expect(overlay.props.open).toBe(true)
  })
})
