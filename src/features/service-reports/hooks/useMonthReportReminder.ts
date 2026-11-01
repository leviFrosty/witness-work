import useNotifications from '@/hooks/notifications'
import { analytics } from '@/lib/analytics'
import { usePreferences } from '@/stores/preferences'

export default function useMonthReportReminder() {
  const enabled = usePreferences((s) => s.monthReportReminders)
  const set = usePreferences((s) => s.set)
  const notifications = useNotifications()

  const setEnabled = async (
    next: boolean,
    source: 'settings' | 'report_offer'
  ) => {
    if (next && !notifications.allowed && !(await notifications.turnOn()))
      return false
    set({ monthReportReminders: next, monthReportReminderOfferAnswered: true })
    analytics.capture('month_report_reminder_changed', {
      enabled: next,
      source,
    })
    return next
  }

  return { enabled, setEnabled }
}
