import moment from 'moment'
import { navigationRef } from '@/features/contacts/lib/linking'
import type { ReminderData } from '@/lib/notificationData'
import { currentServiceStreak } from '@/lib/currentServiceStreak'
import { recurringPlanOnDay } from '@/lib/reminderSchedule'
import { logPlannedDayParams, unloggedDay } from '@/lib/unloggedDayReminders'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'

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
      if (target.day) {
        const recurring = useServiceReport
          .getState()
          .recurringPlans.find((p) => p.id === target.id)
        if (!recurring || !recurringPlanOnDay(recurring, target.day))
          return false
        navigationRef.navigate('Plan Details', {
          recurringPlanId: recurring.id,
          date: target.day,
        })
        return true
      }
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
    case 'monthReport': {
      const month = moment(target.id, 'YYYY-MM', true)
      if (!month.isValid()) return false
      navigationRef.navigate('ServiceReportView', {
        month: month.month(),
        year: month.year(),
      })
      return true
    }
    case 'weekPlan': {
      const week = moment(target.id, 'YYYY-MM-DD', true)
      if (!week.isValid()) return false
      navigationRef.navigate(
        'Root',
        {
          screen: 'Schedule',
          params: { month: week.month(), year: week.year() },
        } as never,
        { pop: true }
      )
      return true
    }
  }
}
