import { useState } from 'react'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import type { ShareReply, ShareType } from '@/features/buddies/lib/schemas'
import { replyHoldMs } from '@/features/buddies/lib/state'
import offerReplaceOverlappingPlans from '@/features/buddies/lib/offerReplaceOverlappingPlans'
import {
  type ShareAnswerSource,
  trackShareAnswer,
} from '@/features/buddies/lib/shareAnswerAnalytics'
import { noteUserAction } from '@/lib/userAction'

export default function useAnswerShare(source: ShareAnswerSource) {
  const [busy, setBusy] = useState(false)
  const answer = async (
    shareKey: string,
    type: ShareType,
    reply: ShareReply
  ) => {
    trackShareAnswer(source, type, reply)

    if (reply === 'going') noteUserAction('going')
    setBusy(true)
    try {
      await buddiesEngine.replyToShare(shareKey, reply, {
        holdMs: replyHoldMs(reply),
      })
      if (reply === 'going') offerReplaceOverlappingPlans(shareKey)
    } finally {
      setBusy(false)
    }
  }
  return { busy, answer }
}
