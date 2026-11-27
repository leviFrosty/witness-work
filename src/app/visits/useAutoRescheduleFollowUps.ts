import { useEffect } from 'react'
import { addForegroundListener } from '@/lib/appLifecycle'
import { analytics } from '@/lib/analytics'
import { computeAutoReschedules } from '@/lib/autoRescheduleFollowUps'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import {
  DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET,
  usePreferences,
} from '@/stores/preferences'

export function runAutoReschedulePass(now: Date = new Date()): number {
  const prefs = usePreferences.getState()
  if (!prefs.autoRescheduleMissedFollowUps) return 0

  const { conversations, updateConversation } = useConversations.getState()
  const { contacts } = useContacts.getState()

  const plans = computeAutoReschedules({
    conversations,
    contacts,
    settings: {
      enabled: prefs.autoRescheduleMissedFollowUps,
      offset: prefs.autoRescheduleOffset,
      grace: prefs.autoRescheduleGrace,
      maxCount: prefs.autoRescheduleMaxCount,
      enabledAt: prefs.autoRescheduleEnabledAt,
    },
    defaultNotificationOffset: {
      ...DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET,
      ...prefs.returnVisitNotificationOffset,
    },
    now,
  })

  for (const plan of plans) {
    updateConversation(plan.updatedVisit)
    analytics.capture('follow_up_auto_rescheduled', {
      count: plan.count,
      reminder_enabled: !!plan.updatedVisit.followUp?.notifyMe,
    })
  }

  return plans.length
}

export default function useAutoRescheduleFollowUps(ready: boolean) {
  const enabled = usePreferences((s) => s.autoRescheduleMissedFollowUps)
  const offset = usePreferences((s) => s.autoRescheduleOffset)
  const grace = usePreferences((s) => s.autoRescheduleGrace)
  const maxCount = usePreferences((s) => s.autoRescheduleMaxCount)
  const enabledAt = usePreferences((s) => s.autoRescheduleEnabledAt)
  const conversations = useConversations((s) => s.conversations)
  const contacts = useContacts((s) => s.contacts)

  useEffect(() => {
    if (!ready || !enabled) return
    runAutoReschedulePass()
  }, [
    ready,
    enabled,
    offset,
    grace,
    maxCount,
    enabledAt,
    conversations,
    contacts,
  ])

  useEffect(() => {
    if (!ready || !enabled) return
    const subscription = addForegroundListener(() => {
      runAutoReschedulePass()
    })
    return () => subscription.remove()
  }, [ready, enabled])
}
