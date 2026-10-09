import { describe, expect, it, vi } from 'vitest'
import {
  buddiesErrorMessage,
  buddiesFailureReason,
  isRetryableBuddiesError,
} from '@/features/buddies/lib/buddiesErrors'
import { BuddyInviteError } from '@/features/buddies/lib/engine'
import { RelayError } from '@/features/buddies/lib/relay'

vi.mock('@/lib/locales', () => ({
  default: { t: (key: string) => key },
}))

describe('Buddies errors', () => {
  it('reads a timeout as a connection problem', () => {
    const timeout = new RelayError('timeout', 0)
    expect(buddiesErrorMessage(timeout)).toBe('buddies_errorTimeout')
    expect(buddiesFailureReason(timeout)).toBe('offline')
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
})
