import { navigationRef } from '@/features/contacts/lib/linking'
import type { ReminderData } from '@/lib/notificationData'
import { currentServiceStreak } from '@/lib/currentServiceStreak'
import { logPlannedDayParams, unloggedDay } from '@/lib/unloggedDayReminders'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'

/**
 * Opens what a local reminder is about: the Follow-up's Visit (its Contact when
 * only the Visit is gone), the Plan, the returning Contact, Add Time for a
 * planned day, or where a streak about to end is kept. False when the record is
 * gone (deleted on this or another device), the day has time logged, or
 * navigation isn't ready.
 */
export function openReminderTarget(target: ReminderData): boolean {
  if (!navigationRef.isReady()) return false
  const contacts = useContacts.getState().contacts
  switch (target.kind) {
    case 'visit': {
      const visit = useConversations
        .getState()
        .conversations.find((v) => v.id === target.id)
      const contactId = visit?.contact.id ?? target.contactId
      if (!contactId || !contacts.some((c) => c.id === contactId)) return false
      if (visit) navigationRef.navigate('Visit Details', { visitId: visit.id })
      else navigationRef.navigate('Contact Details', { id: contactId })
      return true
    }
    case 'plan': {
      const plan = useServiceReport
        .getState()
        .dayPlans.find((p) => p.id === target.id)
      if (!plan) return false
      navigationRef.navigate('Plan Details', { dayPlanId: plan.id })
      return true
    }
    case 'contact': {
      if (!contacts.some((c) => c.id === target.id)) return false
      navigationRef.navigate('Contact Details', { id: target.id })
      return true
    }
    case 'unloggedDay': {
      const { dayPlans, recurringPlans, serviceReports } =
        useServiceReport.getState()
      const records = { dayPlans, recurringPlans, timeEntries: serviceReports }
      if (!unloggedDay(target.id, records)) return false
      navigationRef.navigate(
        'Add Time',
        logPlannedDayParams(target.id, records)
      )
      return true
    }
    case 'streak': {
      const streak = currentServiceStreak()
      if (streak.due?.period !== target.id) return false
      if (streak.kind === 'months') {
        navigationRef.navigate('ServiceHistory', { source: 'streak' })
        return true
      }
      const { dayPlans, recurringPlans, serviceReports } =
        useServiceReport.getState()
      navigationRef.navigate(
        'Add Time',
        logPlannedDayParams(target.id, {
          dayPlans,
          recurringPlans,
          timeEntries: serviceReports,
        })
      )
      return true
    }
  }
}
