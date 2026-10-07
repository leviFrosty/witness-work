import { useState } from 'react'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import type { ShareReply, ShareType } from '@/features/buddies/lib/schemas'
import { replyHoldMs } from '@/features/buddies/lib/state'
import {
  type ShareAnswerSource,
  trackShareAnswer,
} from '@/features/buddies/lib/shareAnswerAnalytics'
import { noteUserAction } from '@/lib/userAction'

/**
 * Answers a buddy's invitation. The answer is saved at once; Going is sent
 * right away, Can't Make It after a short wait so it can still change
 * (`replyHoldMs`, counted down by `useReplyDelivery`). One that can't be sent
 * goes out on a later sync.
 */
export default function useAnswerShare(source: ShareAnswerSource) {
  const [busy, setBusy] = useState(false)
  const answer = async (
    shareKey: string,
    type: ShareType,
    reply: ShareReply
  ) => {
    trackShareAnswer(source, type, reply)
    // Going can earn Two by Two; it's the User's own answer.
    if (reply === 'going') noteUserAction('going')
    setBusy(true)
    try {
      await buddiesEngine.replyToShare(shareKey, reply, {
        holdMs: replyHoldMs(reply),
      })
    } finally {
      setBusy(false)
    }
  }
  return { busy, answer }
}
