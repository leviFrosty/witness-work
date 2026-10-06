import { useState } from 'react'
import { Alert } from 'react-native'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buddiesErrorMessage } from '@/features/buddies/lib/buddiesErrors'
import type { ShareReply, ShareType } from '@/features/buddies/lib/schemas'
import {
  type ShareAnswerSource,
  trackShareAnswer,
} from '@/features/buddies/lib/shareAnswerAnalytics'

/** Answers a buddy's invitation, saying why when it couldn't be sent. */
export default function useAnswerShare(source: ShareAnswerSource) {
  const [busy, setBusy] = useState(false)
  const answer = async (
    shareKey: string,
    type: ShareType,
    reply: ShareReply
  ) => {
    trackShareAnswer(source, type, reply)
    setBusy(true)
    try {
      await buddiesEngine.replyToShare(shareKey, reply)
    } catch (error) {
      Alert.alert(buddiesErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return { busy, answer }
}
