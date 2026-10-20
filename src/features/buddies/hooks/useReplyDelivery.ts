import { useEffect, useState } from 'react'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { replyDelivery } from '@/features/buddies/lib/replyDelivery'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { useBuddiesSession } from '@/features/buddies/stores/buddiesSession'

/** Try Again reads as Sending… at least this long, even when it fails at once. */
const RETRY_MIN_MS = 1000

/**
 * The short status after this User's answer to an invitation, e.g. "Sending in
 * 12s", ticking each second while it waits; undefined once it reached the
 * buddy. `retry` sends it now, and is there only while it reads as not sent.
 */
export default function useReplyDelivery(shareKey: string | undefined): {
  label: string | undefined
  retry?: () => void
} {
  const unsentReplyRev = useBuddies((state) =>
    shareKey === undefined
      ? undefined
      : state.incomingShares[shareKey]?.unsentReplyRev
  )
  const replySendAt = useBuddies((state) =>
    shareKey === undefined
      ? undefined
      : state.incomingShares[shareKey]?.replySendAt
  )
  const sending = useBuddiesSession((state) => state.sending > 0)
  const [retrying, setRetrying] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const delivery = replyDelivery(
    { unsentReplyRev, replySendAt },
    now,
    sending || retrying
  )
  const ticking =
    delivery.kind === 'countdown' || (delivery.kind === 'sending' && !sending)

  // A new answer starts its own countdown; then it ticks until it settles.
  useEffect(() => {
    setNow(Date.now())
  }, [unsentReplyRev, replySendAt])
  useEffect(() => {
    if (!ticking) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [ticking])

  const retry = async () => {
    setRetrying(true)
    await Promise.all([
      buddiesEngine.deliverReplies().catch(() => {
        // Still saved; it reads as not sent again.
      }),
      new Promise((resolve) => setTimeout(resolve, RETRY_MIN_MS)),
    ])
    setRetrying(false)
    const sent =
      shareKey === undefined ||
      useBuddies.getState().incomingShares[shareKey]?.unsentReplyRev ===
        undefined
    analytics.capture('buddy_invitation_answer_retried', { sent })
  }

  switch (delivery.kind) {
    case 'countdown':
      return {
        label: i18n.t('buddies_answerSendingIn', { seconds: delivery.seconds }),
      }
    case 'sending':
      return { label: i18n.t('buddies_answerSending') }
    case 'unsent':
      return {
        label: i18n.t('buddies_answerNotSent'),
        retry: () => void retry(),
      }
    case 'sent':
      return { label: undefined }
  }
}
