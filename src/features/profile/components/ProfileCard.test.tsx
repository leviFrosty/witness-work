import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

const profile = vi.hoisted(() => ({
  name: 'Alex Example',
  avatar: { type: 'image', value: 'file:///profile.png' },
  customAvatarBackground: null,
  set: vi.fn(),
}))

vi.mock('lucide-react-native', () => ({
  Clock: 'Clock',
  Heart: 'Heart',
  Star: 'Star',
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: {}, fonts: {} }),
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: (select: (state: object) => unknown) =>
    select({
      installedOn: '2026-01-01',
      showBadges: false,
      showStreaks: false,
    }),
}))
vi.mock('@/stores/profile', () => ({ useProfile: () => profile }))
vi.mock('@/hooks/usePublisher', () => ({
  default: () => ({ type: 'publisher', isInFullTimeService: false }),
}))
vi.mock('@/hooks/useUser', () => ({ default: () => ({ name: profile.name }) }))
vi.mock('@/hooks/useIsSupporter', () => ({ default: () => ({ since: null }) }))
vi.mock('@/hooks/useServiceStreak', () => ({ default: () => 0 }))
vi.mock('@/lib/serviceStreak', () => ({ shownStreak: () => 0 }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/numbers', () => ({ formatNumber: String }))
vi.mock('@/lib/badges/display', () => ({ profileBadges: () => [] }))
vi.mock('@/components/ProfileCardLayout', () => ({
  default: ({ avatar }: { avatar: React.ReactNode }) => avatar,
}))
vi.mock('@/components/ui/Avatar', () => ({ default: 'Avatar' }))
vi.mock('@/components/AvatarPickerPopover', () => ({ default: 'AvatarPicker' }))
vi.mock('@/components/StreakBadge', () => ({ default: 'StreakBadge' }))
vi.mock('@/components/ui/TextInput', () => ({ default: 'TextInput' }))
vi.mock('@/features/profile/components/ProfileCardBadges', () => ({
  default: 'ProfileCardBadges',
}))

import ProfileCard from '@/features/profile/components/ProfileCard'

let renderer: ReactTestRenderer | undefined
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  vi.clearAllMocks()
})

describe('ProfileCard avatar', () => {
  it('enables the shared expanded viewer in the read-only profile', () => {
    act(() => {
      renderer = create(<ProfileCard readOnly />)
    })
    const avatar = renderer!.root.findByType('Avatar' as never)
    expect(avatar.props.focusable).toBe(true)
    expect(avatar.props.avatar).toBe(profile.avatar)
    expect(avatar.props.name).toBe(profile.name)
    expect(profile.set).not.toHaveBeenCalled()
  })

  it('keeps the avatar picker in the editable profile', () => {
    act(() => {
      renderer = create(<ProfileCard />)
    })
    const picker = renderer!.root.findByType('AvatarPicker' as never)
    expect(picker.props.value).toBe(profile.avatar)
    act(() => picker.props.onChange({ type: 'emoji', value: '🌻' }))
    expect(profile.set).toHaveBeenCalledWith({
      avatar: { type: 'emoji', value: '🌻' },
    })
  })
})
