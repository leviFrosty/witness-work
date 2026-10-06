import { navigationRef } from '@/features/contacts/lib/linking'
import type { ReminderData } from '@/lib/notificationData'
import { unloggedDay } from '@/lib/unloggedDayReminders'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'

/**
 * Opens what a local reminder is about: the Follow-up's Contact (with the Visit
 * highlighted), the Plan, the returning Contact, or Add Time for a planned day.
 * False when the record is gone (deleted on this or another device), the day
 * has time logged, or navigation isn't ready.
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
      navigationRef.navigate('Contact Details', {
        id: contactId,
        ...(visit ? { highlightedVisitId: visit.id } : {}),
      })
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
      const day = unloggedDay(target.id, {
        dayPlans,
        recurringPlans,
        timeEntries: serviceReports,
      })
      if (!day) return false
      const [year, month, date] = day.key.split('-').map(Number)
      navigationRef.navigate('Add Time', {
        date: new Date(year, month - 1, date, 12).toISOString(),
        hours: Math.floor(day.minutes / 60),
        minutes: day.minutes % 60,
        categoryId: day.categoryId,
      })
      return true
    }
  }
}
