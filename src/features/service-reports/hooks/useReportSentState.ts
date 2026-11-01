import { usePreferences } from '@/stores/preferences'
import { entryTimestampKey } from '@/lib/syncPreferencePolicy'
import { reportMonthKey } from '@/features/service-reports/lib/monthReportExport'
import {
  reportSentLabel,
  reportSentState,
} from '@/features/service-reports/lib/reportSentState'

export default function useReportSentState(month: number, year: number) {
  const monthKey = reportMonthKey(month, year)
  const submittedReportMonths = usePreferences((s) => s.submittedReportMonths)
  const stampKey = entryTimestampKey('submittedReportMonths', monthKey)
  const stamp = usePreferences((s) => s.preferenceUpdatedAt?.[stampKey])
  const state = reportSentState(
    {
      submittedReportMonths,
      preferenceUpdatedAt: stamp === undefined ? {} : { [stampKey]: stamp },
    },
    monthKey
  )
  return { ...state, monthKey, label: reportSentLabel(state) }
}
