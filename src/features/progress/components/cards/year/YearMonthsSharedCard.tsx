import { serviceYearMonths } from '@/lib/roleHistory'
import useServiceReport from '@/stores/serviceReport'
import {
  firstRecordMonth,
  monthsShared,
} from '@/features/progress/lib/periodCardStats'
import { useTodayMonth } from '@/features/progress/hooks/usePeriodCardData'
import MonthsSharedStatCard from '@/features/progress/components/cards/MonthsSharedStatCard'
import type { YearCardProps } from '@/features/progress/components/cards/types'

export default function YearMonthsSharedCard({
  serviceYear,
  size,
}: YearCardProps) {
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const stats = monthsShared({
    serviceReports,
    months: serviceYearMonths(serviceYear),
    since: firstRecordMonth(serviceReports),
    today: useTodayMonth(),
  })
  return <MonthsSharedStatCard stats={stats} size={size} />
}
