import i18n from '@/lib/locales'
import useServiceReport from '@/stores/serviceReport'
import {
  firstRecordMonth,
  monthsBetween,
  monthsShared,
} from '@/features/progress/lib/periodCardStats'
import { useTodayMonth } from '@/features/progress/hooks/usePeriodCardData'
import MonthsSharedStatCard from '@/features/progress/components/cards/MonthsSharedStatCard'
import type { AllTimeCardProps } from '@/features/progress/components/cards/types'

export default function AllTimeMonthsSharedCard({ size }: AllTimeCardProps) {
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const today = useTodayMonth()
  const since = firstRecordMonth(serviceReports)
  const stats = monthsShared({
    serviceReports,
    months: since ? monthsBetween(since, today) : [],
    since,
    today,
  })
  return (
    <MonthsSharedStatCard
      stats={stats}
      caption={
        stats.longestRun > 1
          ? i18n.t('progressCards.allTime.monthsShared.longestRun', {
              count: stats.longestRun,
            })
          : undefined
      }
      size={size}
    />
  )
}
