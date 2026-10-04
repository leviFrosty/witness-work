import * as Crypto from 'expo-crypto'
import { analytics } from '@/lib/analytics'
import useConversations from '@/stores/conversationStore'
import type { Visit } from '@/types/visit'

/**
 * One-tap Not at Home from Home's Follow-up card, with an undo. The Visit has
 * no Follow-up of its own; rescheduling moves the original one instead.
 */
export default function useLogNotAtHome() {
  const addConversation = useConversations((s) => s.addConversation)
  const deleteConversation = useConversations((s) => s.deleteConversation)

  const log = (contactId: string): Visit => {
    const visit: Visit = {
      id: Crypto.randomUUID(),
      contact: { id: contactId },
      date: new Date(),
      isBibleStudy: false,
      notAtHome: true,
    }
    addConversation(visit)
    analytics.capture('visit_created', {
      not_at_home: true,
      bible_study: false,
      has_follow_up: false,
      reminder_enabled: false,
      source: 'follow_up_card',
    })
    return visit
  }

  const undo = (visit: Visit) => {
    deleteConversation(visit.id)
    analytics.capture('visit_deleted', { source: 'follow_up_card' })
  }

  return { log, undo }
}
