import moment from 'moment'
import useLocalDay from '@/hooks/useLocalDay'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import { dueReportMonth } from '@/features/service-reports/lib/previousReportReminder'
import { useShallow } from 'zustand/react/shallow'

export default function useDueReportMonth(now?: number) {
  const today = useLocalDay()
  const { submittedReportMonths, installedOn } = usePreferences(
    useShallow((s) => ({
      submittedReportMonths: s.submittedReportMonths,
      installedOn: s.installedOn,
    }))
  )
  const serviceReports = useServiceReport((state) => state.serviceReports)
  return dueReportMonth({
    installedOn,
    now:
      now === undefined ? moment(today, 'YYYY-MM-DD').toDate() : new Date(now),
    serviceReports,
    submittedReportMonths,
  })
}
