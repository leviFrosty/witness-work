import { describe, expect, it } from 'vitest'
import {
  buddyAlertSettings,
  type BuddySettings,
  buddySettings,
  initialBuddiesState,
  ownSettingsCount,
  rosterOverrides,
  withOverride,
} from '@/features/buddies/lib/state'

const sharing = { ...initialBuddiesState.sharing, streak: false }

describe('buddy settings over All Buddies', () => {
  it('takes a buddy’s own value where they have one, and says where each comes from', () => {
    const { settings, sources } = buddySettings(sharing, {
      overrides: { plans: false, streak: false },
    })
    expect(settings).toMatchObject({ plans: false, streak: false, photo: true })

    expect(sources).toMatchObject({
      plans: 'buddy',
      streak: 'buddy',
      photo: 'all',
      planTimes: 'all',
    })
    expect(buddySettings(sharing, {}).sources.plans).toBe('all')
  })

  it('sets and drops one override, leaving none as undefined', () => {
    const one = withOverride<BuddySettings, 'plans'>(undefined, 'plans', false)
    expect(one).toEqual({ plans: false })
    expect(withOverride(one, 'planTimes', 'timeOfDay')).toEqual({
      plans: false,
      planTimes: 'timeOfDay',
    })
    expect(withOverride(one, 'plans', undefined)).toBeUndefined()
  })

  it('resolves alerts on this device the same way', () => {
    const state = {
      joinRequestNotifications: false,
      badgeNotifications: true,
      alertOverrides: { grace: { joinRequests: true } },
    }
    expect(buddyAlertSettings(state, 'grace')).toEqual({
      settings: { joinRequests: true, badges: true },
      sources: { joinRequests: 'buddy', badges: 'all' },
    })
    expect(buddyAlertSettings(state, 'ben').settings.joinRequests).toBe(false)
    expect(
      ownSettingsCount(
        { inboxId: 'grace', overrides: { plans: false } },
        state.alertOverrides
      )
    ).toBe(2)
  })

  it('reads a roster entry’s overrides, or an older app’s calendar choice', () => {
    const previous = { plans: false }

    expect(
      rosterOverrides(
        {
          showOnCalendar: true,
          overrides: { streak: false, planTimes: undefined },
        },
        sharing,
        previous
      )
    ).toEqual({ streak: false })
    expect(
      rosterOverrides(
        { showOnCalendar: true, overrides: {} },
        sharing,
        previous
      )
    ).toBeUndefined()

    expect(rosterOverrides({ showOnCalendar: true }, sharing, previous)).toBe(
      previous
    )
    expect(
      rosterOverrides({ showOnCalendar: false }, sharing, previous)
    ).toEqual({ plans: false, showOnCalendar: false })
  })
})
