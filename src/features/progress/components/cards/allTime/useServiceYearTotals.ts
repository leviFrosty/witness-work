import {
  getServiceYearEndYearsSpan,
  getServiceYearTotalsByEndYear,
} from '@/lib/serviceReport'
import { useAllTimeEntries } from '@/features/progress/hooks/usePeriodCardData'

/**
 * Every Service Year from the first record to the one under way, oldest first,
 * with its raw total, as the Year by Year list counts them.
 */
export default function useServiceYearTotals() {
  const entries = useAllTimeEntries()
  const totals = getServiceYearTotalsByEndYear(entries)
  return getServiceYearEndYearsSpan(entries).map((endYear) => ({
    endYear,
    minutes: totals.get(endYear)?.minutes ?? 0,
  }))
}
