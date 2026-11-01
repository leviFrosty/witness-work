import { describe, expect, it, vi } from 'vitest'
import {
  buddiesErrorMessage,
  buddiesFailureReason,
  isRetryableBuddiesError,
} from '@/features/buddies/lib/buddiesErrors'
import {
  BuddyInviteError,
  BuddyRemovalPendingError,
} from '@/features/buddies/lib/engine'
import { RelayError } from '@/features/buddies/lib/relay'

const t = vi.hoisted(() => vi.fn((key: string, _options?: object) => key))
vi.mock('@/lib/locales', () => ({ default: { t } }))
const platform = vi.hoisted(() => ({ OS: 'ios' }))
vi.mock('react-native', () => ({ Platform: platform }))

describe('Buddies errors', () => {
  it('reads a timeout as a connection problem', () => {
    const timeout = new RelayError('timeout', 0)
    expect(buddiesErrorMessage(timeout)).toBe('buddies_errorTimeout')
    expect(buddiesFailureReason(timeout)).toBe('offline')
  })

  it('says why Delete My Buddies Data stopped, naming one car it couldn’t leave', () => {
    const message = (cars?: string[]) => {
      buddiesErrorMessage(new BuddyRemovalPendingError('everything', cars))
      return t.mock.lastCall
    }
    expect(message()).toEqual(['buddies_deleteAllPending'])
    expect(message(['Mazda CX-5'])).toEqual([
      'buddies_deleteAllCarPending',
      { car: 'Mazda CX-5' },
    ])

    expect(message([''])).toEqual([
      'buddies_deleteAllCarsPending',
      { count: 1 },
    ])
    expect(message(['Mazda CX-5', ''])).toEqual([
      'buddies_deleteAllCarsPending',
      { count: 2 },
    ])
    expect(buddiesErrorMessage(new BuddyRemovalPendingError('buddy'))).toBe(
      'buddies_removePending'
    )
    expect(
      isRetryableBuddiesError(new BuddyRemovalPendingError('everything', ['']))
    ).toBe(false)
  })

  it("names the relay's cap on open invites", () => {
    expect(buddiesErrorMessage(new BuddyInviteError('openInvites'))).toBe(
      'buddies_openInvitesLimit'
    )
  })

  it('offers Try Again only when trying again can help', () => {
    expect(isRetryableBuddiesError(new RelayError('network', 0))).toBe(true)
    expect(isRetryableBuddiesError(new RelayError('timeout', 0))).toBe(true)
    expect(isRetryableBuddiesError(new RelayError('rate_limited', 429))).toBe(
      true
    )
    expect(isRetryableBuddiesError(new RelayError('unknown', 500))).toBe(true)
    expect(isRetryableBuddiesError(new Error('boom'))).toBe(true)
    expect(isRetryableBuddiesError(new RelayError('disabled', 503))).toBe(false)
    expect(isRetryableBuddiesError(new BuddyInviteError('unavailable'))).toBe(
      false
    )
  })

  it("says when this device can't be verified, and whether that's for now", () => {
    const device = new RelayError('unverified', 403, null, 'device')
    const later = new RelayError('unverified', 0, null, 'temporary')
    expect(buddiesErrorMessage(device)).toBe('buddies_errorUnverified')
    expect(buddiesErrorMessage(later)).toBe('buddies_errorVerifyLater')
    platform.OS = 'android'
    expect(buddiesErrorMessage(device)).toBe('buddies_errorUnverifiedAndroid')
    platform.OS = 'ios'
    expect(buddiesFailureReason(device)).toBe('unverified')
    expect(buddiesFailureReason(later)).toBe('verify_later')
    expect(isRetryableBuddiesError(device)).toBe(false)
    expect(isRetryableBuddiesError(later)).toBe(true)
  })

  it('asks for an update when ww-api needs a newer app', () => {
    const upgrade = new RelayError('upgrade_required', 426)
    expect(buddiesErrorMessage(upgrade)).toBe('buddies_errorUpdate')
    expect(buddiesFailureReason(upgrade)).toBe('update')
    expect(isRetryableBuddiesError(upgrade)).toBe(false)
  })

  it('shows a refused session as the generic error', () => {
    expect(buddiesErrorMessage(new RelayError('forbidden', 403))).toBe(
      'buddies_errorGeneric'
    )
  })
})
