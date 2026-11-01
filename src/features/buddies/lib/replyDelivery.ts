import { REPLY_HOLD_MS, type IncomingShare } from '@/features/buddies/lib/state'

const SENDING_GRACE_MS = 5 * 1000

export const REPLY_RETRY_MS = 30 * 1000

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
