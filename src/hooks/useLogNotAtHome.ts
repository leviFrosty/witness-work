import * as Crypto from 'expo-crypto'
import { noteUserAction } from '@/lib/userAction'
import { analytics } from '@/lib/analytics'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import useConversations from '@/stores/conversationStore'
import { toast } from '@/stores/toasts'
import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'
import type { LogVisitAttribution } from '@/types/rootStack'

export type NotAtHomeAttribution =
  | { source: 'follow_up_card' }
  | { source: 'contact_details' }
  | LogVisitAttribution

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

  const logWithUndo = (
    contact: Pick<Contact, 'id' | 'name'>,
    attribution: NotAtHomeAttribution
  ): Visit => {
    Haptics.light()
    const visit = log(contact.id, attribution)
    toast.undo({
      title: i18n.t('logVisit_notAtHomeLogged', { name: contact.name }),
      onUndo: () => undo(visit),
    })
    return visit
  }

  return { log, undo, logWithUndo }
}
