import { REPLY_HOLD_MS, type IncomingShare } from '@/features/buddies/lib/state'

/** After an answer's wait ends, it reads as Sending… this long at most. */
const SENDING_GRACE_MS = 5 * 1000
/**
 * An answer still unsent this long after it came due is tried once more on its
 * own; after that, syncs and Try Again send it.
 */
export const REPLY_RETRY_MS = 30 * 1000

/**
 * Where an answer to an invitation stands: waiting out its hold (`countdown`,
 * still free to change), going out (`sending`), or `unsent` because sending
 * failed (offline, or Buddies unavailable): a later sync or Try Again sends
 * it.
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

/**
 * When answers next go out on their own: the earliest held answer's wait
 * ending, or the one retry `REPLY_RETRY_MS` after an answer came due, so a
 * failed send doesn't wait for a sync that may not come while the live signal
 * is healthy. Undefined when nothing is waiting.
 */
export function nextReplyAttempt(
  shares: Iterable<Pick<IncomingShare, 'unsentReplyRev' | 'replySendAt'>>,
  now: number
): number | undefined {
  let next: number | undefined
  for (const { unsentReplyRev, replySendAt } of shares) {
    if (unsentReplyRev === undefined) continue
    const at =
      replySendAt !== undefined && replySendAt > now
        ? replySendAt
        : (replySendAt ?? unsentReplyRev) + REPLY_RETRY_MS
    if (at > now && (next === undefined || at < next)) next = at
  }
  return next
}
