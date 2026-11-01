import moment from 'moment'
import { combineDateAndStartTime } from '@/lib/normalizeDate'
import type { ShareDetails, ShareType } from '@/features/buddies/lib/schemas'

export const sharedEventEndsAt = (share: {
  type: ShareType
  details: ShareDetails
}) =>
  combineDateAndStartTime(
    moment.utc(share.details.d, 'YYYY-MM-DD').hour(12).toDate(),
    share.details.s
  ).getTime() + (share.type === 'plan' ? (share.details.m ?? 0) * 60 * 1000 : 0)

export const hasSharedEventEnded = (
  share: { type: ShareType; details: ShareDetails },
  now: number
) => sharedEventEndsAt(share) <= now
