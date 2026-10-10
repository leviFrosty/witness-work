import * as Crypto from 'expo-crypto'
import { noteUserAction } from '@/lib/userAction'
import { analytics } from '@/lib/analytics'
import useConversations from '@/stores/conversationStore'
import type { Visit } from '@/types/visit'
import type { LogVisitAttribution } from '@/types/rootStack'

/** Where a one-tap Not at Home was logged from (analytics). */
export type NotAtHomeAttribution =
  | { source: 'follow_up_card' }
  | LogVisitAttribution

/**
 * One-tap Not at Home, with an undo: from Home's Follow-up card or the Log
 * Visit quick action. The Visit has no Follow-up of its own; rescheduling moves
 * the original one instead.
 */
export default function useLogNotAtHome() {
  const addConversation = useConversations((s) => s.addConversation)
  const deleteConversation = useConversations((s) => s.deleteConversation)

  const log = (
    contactId: string,
    attribution: NotAtHomeAttribution = { source: 'follow_up_card' }
  ): Visit => {
    const visit: Visit = {
      id: Crypto.randomUUID(),
      contact: { id: contactId },
      date: new Date(),
      isBibleStudy: false,
      notAtHome: true,
    }
    noteUserAction('visit')
    addConversation(visit)
    analytics.capture('visit_created', {
      not_at_home: true,
      bible_study: false,
      has_follow_up: false,
      reminder_enabled: false,
      ...attribution,
    })
    return visit
  }

  const undo = (visit: Visit) => {
    deleteConversation(visit.id)
  }

  return { log, undo }
}
