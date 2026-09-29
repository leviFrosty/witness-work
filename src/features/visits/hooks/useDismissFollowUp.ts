import * as Notifications from 'expo-notifications'
import { analytics } from '@/lib/analytics'
import confirmDestructive from '@/lib/confirmDestructive'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import useConversations from '@/stores/conversationStore'
import type { Visit } from '@/types/visit'

/**
 * Silences a Visit's Follow-up after a confirmation: cancels its reminders and
 * marks it dismissed. The Follow-up itself stays on the Visit (topic, date) so
 * history keeps its context; only the reminder and the "due" state go away.
 */
export default function useDismissFollowUp() {
  const updateConversation = useConversations((s) => s.updateConversation)

  const dismiss = async (visit: Visit, onDismissed?: () => void) => {
    await Promise.all(
      (visit.followUp?.notifications ?? []).map(async ({ id }) => {
        try {
          await Notifications.cancelScheduledNotificationAsync(id)
        } catch (e) {
          logger.error('[followUp] failed to cancel notification', e)
        }
      })
    )
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
      onConfirm: () => void dismiss(visit, onDismissed),
    })
  }
}
