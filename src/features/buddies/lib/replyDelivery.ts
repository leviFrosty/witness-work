import { REPLY_HOLD_MS, type IncomingShare } from '@/features/buddies/lib/state'

/** After an answer's wait ends, it reads as Sending… this long at most. */
const SENDING_GRACE_MS = 5 * 1000

/**
 * Where an answer to an invitation stands: waiting out its hold (`countdown`,
 * still free to change), going out (`sending`), or `unsent` because sending
 * failed (offline, or Buddies unavailable) and a later sync will retry.
 */
export type ReplyDelivery =
  | { kind: 'sent' }
  | { kind: 'countdown'; seconds: number }
  | { kind: 'sending' }
  | { kind: 'unsent' }

export function replyDelivery(
  share: Pick<IncomingShare, 'unsentReplyRev' | 'replySendAt'> | undefined,
  now: number,
  sending: boolean
): ReplyDelivery {
  if (!share || share.unsentReplyRev === undefined) return { kind: 'sent' }
  const { replySendAt } = share
  if (replySendAt !== undefined && replySendAt > now) {
    // A render with a stale clock can't count past the hold.
    const seconds = Math.ceil((replySendAt - now) / 1000)
    return {
      kind: 'countdown',
      seconds: Math.min(seconds, Math.ceil(REPLY_HOLD_MS / 1000)),
    }
  }
  const dueSince = replySendAt ?? share.unsentReplyRev
  if (sending || now - dueSince < SENDING_GRACE_MS) return { kind: 'sending' }
  return { kind: 'unsent' }
}
