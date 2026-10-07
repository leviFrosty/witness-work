import { describe, expect, it, vi } from 'vitest'

// `buddyStreakCount` lives beside the profile helpers and their native deps.
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/stores/preferences', () => ({ usePreferences: {} }))
vi.mock('expo-image-manipulator', () => ({}))
vi.mock('@/stores/profile', () => ({ useProfile: {} }))
vi.mock('@/features/buddies/stores/buddiesStore', () => ({ useBuddies: {} }))

import { buddyStreakCount } from '@/features/buddies/lib/buddyProfile'

const today = new Date(2026, 9, 6, 15)

describe('buddyStreakCount', () => {
  it("shows a buddy's streak through its last day", () => {
    expect(buddyStreakCount({ n: 8, until: '2026-10-06' }, today)).toBe(8)
    expect(buddyStreakCount({ n: 8, until: '2026-11-30' }, today)).toBe(8)
  })

  it('hides one that lapsed while their app was closed', () => {
    expect(buddyStreakCount({ n: 8, until: '2026-10-05' }, today)).toBe(0)
  })

  it('hides none, or one under 3', () => {
    expect(buddyStreakCount(undefined, today)).toBe(0)
    expect(buddyStreakCount({ n: 2, until: '2026-10-30' }, today)).toBe(0)
  })
})
