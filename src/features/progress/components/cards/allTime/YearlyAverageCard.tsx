import { Sigma as SigmaIcon } from 'lucide-react-native'
import usePublisher from '@/hooks/usePublisher'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { serviceYearOf } from '@/lib/serviceYear'
import { usePreferences } from '@/stores/preferences'
import { yearlyAverage } from '@/features/progress/lib/periodCardStats'
import { useTodayMonth } from '@/features/progress/hooks/usePeriodCardData'
import StatCard from '@/features/progress/components/cards/StatCard'
import { formatGoalHours } from '@/features/progress/components/cards/displayMinutes'
import useServiceYearTotals from '@/features/progress/components/cards/allTime/useServiceYearTotals'
import type { AllTimeCardProps } from '@/features/progress/components/cards/types'

export default function YearlyAverageCard({ size }: AllTimeCardProps) {
  const timeDisplayFormat = usePreferences((s) => s.timeDisplayFormat)
  const { hasAnnualGoal, annualGoalHours } = usePublisher()
  const currentEndYear = serviceYearOf(useTodayMonth()) + 1
  const average = yearlyAverage(useServiceYearTotals(), currentEndYear)

  return (
    <StatCard
      icon={SigmaIcon}
      title={i18n.t('progressCards.allTime.yearlyAverage.title')}
      value={
        formatMinutes(average?.averageMinutes ?? 0, timeDisplayFormat).formatted
      }
      suffix={average ? i18n.t('progressCards.allTime.perYear') : undefined}
      tone={average ? 'default' : 'muted'}
      caption={
        !average
          ? i18n.t('progressCards.serviceDays.none')
          : average.currentOnly
            ? i18n.t('progressCards.allTime.yearlyAverage.currentOnly')
            : i18n.t('progressCards.allTime.yearlyAverage.over', {
                count: average.years,
              })
      }
      detail={
        hasAnnualGoal && annualGoalHours > 0
          ? i18n.t('progressCards.allTime.yearlyAverage.goal', {
              goal: formatGoalHours(annualGoalHours * 60),
            })
          : undefined
      }
      info={i18n.t('progressCards.allTime.yearlyAverage.info')}
      size={size}
    />
  )
}
