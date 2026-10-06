import { useEffect, useState } from 'react'
import i18n from '@/lib/locales'
import { replyDelivery } from '@/features/buddies/lib/replyDelivery'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { useBuddiesSession } from '@/features/buddies/stores/buddiesSession'

/**
 * The short status after this User's answer to an invitation, e.g. "Sending in
 * 12s", ticking each second while it waits; undefined once it reached the
 * buddy.
 */
export default function useReplyDelivery(
  shareKey: string | undefined
): string | undefined {
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
  const [now, setNow] = useState(() => Date.now())
  const delivery = replyDelivery({ unsentReplyRev, replySendAt }, now, sending)
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

  switch (delivery.kind) {
    case 'countdown':
      return i18n.t('buddies_answerSendingIn', { seconds: delivery.seconds })
    case 'sending':
      return i18n.t('buddies_answerSending')
    case 'unsent':
      return i18n.t('buddies_answerNotSent')
    case 'sent':
      return undefined
  }
}
