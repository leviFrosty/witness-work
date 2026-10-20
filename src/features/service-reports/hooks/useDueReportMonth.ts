import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import { dueReportMonth } from '@/features/service-reports/lib/previousReportReminder'
import { useShallow } from 'zustand/react/shallow'

/**
 * The month whose Service Report to send: last month until it's sent (or marked
 * as already submitted), then this month. Home's report card, the onboarding
 * checklist, and the tray reminder all point here, so nobody is invited to send
 * this month's report while it's still partial.
 */
export default function useDueReportMonth(now: number = Date.now()) {
  const { submittedReportMonths, installedOn } = usePreferences(
    useShallow((s) => ({
      submittedReportMonths: s.submittedReportMonths,
      installedOn: s.installedOn,
    }))
  )
  const serviceReports = useServiceReport((state) => state.serviceReports)
  return dueReportMonth({
    installedOn,
    now: new Date(now),
    serviceReports,
    submittedReportMonths,
  })
}
