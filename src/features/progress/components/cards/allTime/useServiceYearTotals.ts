import {
  getServiceYearEndYearsSpan,
  getServiceYearTotalsByEndYear,
} from '@/lib/serviceReport'
import { useAllTimeEntries } from '@/features/progress/hooks/usePeriodCardData'

export default function useServiceYearTotals() {
  const entries = useAllTimeEntries()
  const totals = getServiceYearTotalsByEndYear(entries)
  return getServiceYearEndYearsSpan(entries).map((endYear) => ({
    endYear,
    minutes: totals.get(endYear)?.minutes ?? 0,
  }))
}
