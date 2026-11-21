import { MAX_BUDDIES } from '@/features/buddies/lib/schemas'
import type { AppBuddiesConfig } from '@/lib/appUpdate/updateRequired'

export type BuddyLimits = {
  maxBuddies: number
  maxOpenInvites: number
}

export const DEFAULT_BUDDY_LIMITS: BuddyLimits = {
  maxBuddies: MAX_BUDDIES,
  maxOpenInvites: 5,
}

export function resolveBuddyLimits(
  server: AppBuddiesConfig | null
): BuddyLimits {
  const maxBuddies = Math.min(
    server?.maxBuddies ?? DEFAULT_BUDDY_LIMITS.maxBuddies,
    MAX_BUDDIES
  )
  return {
    maxBuddies,
    maxOpenInvites: Math.min(
      server?.maxOpenInvites ?? DEFAULT_BUDDY_LIMITS.maxOpenInvites,
      maxBuddies
    ),
  }
}
