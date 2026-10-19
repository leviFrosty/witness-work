import moment from 'moment'
import { combineDateAndStartTime } from '@/lib/normalizeDate'
import type { ShareDetails, ShareType } from '@/features/buddies/lib/schemas'

/**
 * When a buddy's shared Plan ends, or their Follow-up happens (epoch ms, on
 * this device's clock); one with no start time is at noon.
 */
export const sharedEventEndsAt = (share: {
  type: ShareType
  details: ShareDetails
}) =>
  // A stored anchor: local midnight at UTC+12 is noon UTC of the prior day,
  // which `combineDateAndStartTime` would read as that day.
  combineDateAndStartTime(
    moment.utc(share.details.d, 'YYYY-MM-DD').hour(12).toDate(),
    share.details.s
  ).getTime() + (share.type === 'plan' ? (share.details.m ?? 0) * 60 * 1000 : 0)

/**
 * Whether a buddy's shared Plan or Follow-up is over: it can still be looked
 * at, but no longer answered.
 */
export const hasSharedEventEnded = (
  share: { type: ShareType; details: ShareDetails },
  now: number
) => sharedEventEndsAt(share) <= now
