import { useEffect, useState } from 'react'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { replyDelivery } from '@/features/buddies/lib/replyDelivery'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { useBuddiesSession } from '@/features/buddies/stores/buddiesSession'

const RETRY_MIN_MS = 1000

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
      buddiesEngine.deliverReplies().catch(() => {}),
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
