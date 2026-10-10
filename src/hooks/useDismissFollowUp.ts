import { analytics } from '@/lib/analytics'
import confirmDestructive from '@/lib/confirmDestructive'
import i18n from '@/lib/locales'
import useConversations from '@/stores/conversationStore'
import type { Visit } from '@/types/visit'

/**
 * Silences a Visit's Follow-up after a confirmation: marks it dismissed, which
 * also removes its reminder (see `useReconciledReminders`). The Follow-up
 * itself stays on the Visit (topic, date) so history keeps its context; only
 * the reminder and the "due" state go away.
 */
export default function useDismissFollowUp() {
  const updateConversation = useConversations((s) => s.updateConversation)

  const dismiss = (visit: Visit, onDismissed?: () => void) => {
    // Read the latest record: the Visit may have changed while the
    // confirmation was up.
    const latest =
      useConversations
        .getState()
        .conversations.find((c) => c.id === visit.id) ?? visit
    if (!latest.followUp) return
    updateConversation({
      ...latest,
      followUp: { ...latest.followUp, notifications: [], dismissed: true },
    })
    analytics.capture('follow_up_dismissed')
    onDismissed?.()
  }

  return (visit: Visit, onDismissed?: () => void) => {
    if (!visit.followUp) return
    confirmDestructive({
      title: i18n.t('dismissFollowUpConfirmTitle'),
      description: i18n.t('dismissFollowUpConfirmDesc'),
      confirmLabel: i18n.t('dismiss'),
      onConfirm: () => dismiss(visit, onDismissed),
    })
  }
}
