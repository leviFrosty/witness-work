import { createElement, type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

const profile = vi.hoisted(() => ({
  name: 'Sam Rivera',
  avatar: { type: 'emoji' as const, value: '🌻' },
  customAvatarBackground: '#E11D48',
}))

vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: vi.fn() }),
}))
vi.mock('@/components/ui/DirectionalIcon', () => ({
  ChevronForwardIcon: 'ChevronForwardIcon',
}))
vi.mock('@/components/ui/Avatar', () => ({ default: 'Avatar' }))
vi.mock('@/components/ui/LucideIcon', () => ({ default: 'LucideIcon' }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: { textAlt: '#888' } }),
}))
vi.mock('@/hooks/useServiceStreak', () => ({ default: () => 0 }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/serviceStreak', () => ({ shownStreak: () => 0 }))
vi.mock('@/stores/pet', () => ({
  usePet: (select: (state: { pet: null }) => unknown) => select({ pet: null }),
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: (
    select: (state: {
      role: string
      tenureStartDate: null
      showBadges: boolean
      showStreaks: boolean
    }) => unknown
  ) =>
    select({
      role: 'publisher',
      tenureStartDate: null,
      showBadges: false,
      showStreaks: false,
    }),
}))
vi.mock('@/stores/profile', () => ({
  useProfile: (select?: (state: typeof profile) => unknown) =>
    select ? select(profile) : profile,
}))
vi.mock('@/features/buddies/components/BuddiesSection', () => ({
  default: ({ children }: { children?: ReactNode }) =>
    createElement('section', null, children),
}))
vi.mock('@/features/buddies/components/BuddyListRow', () => ({
  default: ({ leading }: { leading?: ReactNode }) =>
    createElement('row', null, leading),
}))
vi.mock('@/features/buddies/components/ScopedSettingRows', () => ({
  ScopedSwitchRow: () => null,
}))
vi.mock('@/features/buddies/hooks/useBuddySettingsScope', () => ({
  useBuddySettingsScope: () => ({ buddy: null }),
  useScopedSetting: () => ({
    value: true,
    source: 'all',
    inherited: true,
    overriddenBy: [],
    set: vi.fn(),
  }),
}))
vi.mock('@/features/buddies/lib/buddyProfile', () => ({
  buddyDisplayName: () => '',
  buddyTenureFor: () => undefined,
  buddyTenureLabel: () => '',
}))
vi.mock('@/features/buddies/hooks/useBuddiesCardName', () => ({
  default: () => profile.name,
}))

import BuddiesSharingSection from '@/features/buddies/components/BuddiesSharingSection'

let renderer: ReactTestRenderer | undefined

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

describe('BuddiesSharingSection', () => {
  it('leaves the profile avatar background to the supporter-gated theme', () => {
    act(() => {
      renderer = create(<BuddiesSharingSection />)
    })

    const avatar = renderer!.root.findByType('Avatar' as never)
    expect(avatar.props.avatar).toBe(profile.avatar)
    expect(avatar.props.name).toBe(profile.name)
    expect(avatar.props.background).toBeUndefined()
  })
})
