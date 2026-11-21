import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BUDDY_LIMITS,
  resolveBuddyLimits,
} from '@/features/buddies/lib/limits'
import { MAX_BUDDIES } from '@/features/buddies/lib/schemas'

describe('the Buddies caps', () => {
  it('uses the built-in caps until ww-api has answered', () => {
    expect(resolveBuddyLimits(null)).toEqual(DEFAULT_BUDDY_LIMITS)
    expect(DEFAULT_BUDDY_LIMITS).toEqual({
      maxBuddies: MAX_BUDDIES,
      maxOpenInvites: 5,
    })
  })

  it('follows what ww-api publishes', () => {
    expect(resolveBuddyLimits({ maxBuddies: 20, maxOpenInvites: 3 })).toEqual({
      maxBuddies: 20,
      maxOpenInvites: 3,
    })
  })

  it('never goes above what this build can store', () => {
    expect(
      resolveBuddyLimits({ maxBuddies: 500, maxOpenInvites: 500 })
    ).toEqual({ maxBuddies: MAX_BUDDIES, maxOpenInvites: MAX_BUDDIES })
    expect(resolveBuddyLimits({ maxBuddies: 4, maxOpenInvites: 10 })).toEqual({
      maxBuddies: 4,
      maxOpenInvites: 4,
    })
  })
})
