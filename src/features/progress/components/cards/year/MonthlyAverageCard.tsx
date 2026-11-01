import { ChartColumn as ChartColumnIcon } from 'lucide-react-native'
import usePublisher from '@/hooks/usePublisher'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { serviceYearFocusMonth } from '@/lib/roleHistory'
import { usePreferences } from '@/stores/preferences'
import { monthlyAverage } from '@/features/progress/lib/periodCardStats'
import {
  useServiceYearMonthTotals,
  useTodayMonth,
} from '@/features/progress/hooks/usePeriodCardData'
import StatCard from '@/features/progress/components/cards/StatCard'
import { formatGoalHours } from '@/features/progress/components/cards/displayMinutes'
import type { YearCardProps } from '@/features/progress/components/cards/types'

export default function MonthlyAverageCard({
  serviceYear,
  size,
}: YearCardProps) {
  const timeDisplayFormat = usePreferences((s) => s.timeDisplayFormat)
  const totals = useServiceYearMonthTotals(serviceYear)
  const average = monthlyAverage(totals, useTodayMonth())
  const { monthlyGoalHours } = usePublisher(serviceYearFocusMonth(serviceYear))
  const goalMinutes = monthlyGoalHours * 60
  const metGoal =
    !!average && goalMinutes > 0 && average.averageMinutes >= goalMinutes

  return (
    <StatCard
      icon={ChartColumnIcon}
      title={i18n.t('progressCards.year.monthlyAverage.title')}
      value={
        formatMinutes(average?.averageMinutes ?? 0, timeDisplayFormat).formatted
      }
      suffix={average ? i18n.t('progressCards.perMonth') : undefined}
      tone={!average ? 'muted' : metGoal ? 'accent' : 'default'}
      caption={
        average
          ? i18n.t('progressCards.year.monthlyAverage.over', {
              count: average.months,
            })
          : i18n.t('progressCards.serviceDays.none')
      }
      detail={
        goalMinutes > 0
          ? i18n.t('progressCards.year.monthlyAverage.goal', {
              goal: formatGoalHours(goalMinutes),
            })
          : undefined
      }
      info={i18n.t('progressCards.year.monthlyAverage.info')}
      size={size}
    />
  )
}
