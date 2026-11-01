import { CalendarRange as CalendarRangeIcon } from 'lucide-react-native'
import moment from 'moment'
import {
  isInServiceYear,
  serviceYearBounds,
  serviceYearOf,
} from '@/lib/serviceYear'
import useLocalDay from '@/hooks/useLocalDay'
import SimpleProgressBar from '@/components/ui/SimpleProgressBar'
import YearMilestoneCard from '@/components/YearMilestoneCard'
import useTheme from '@/contexts/theme'
import usePublisher from '@/hooks/usePublisher'
import { goalProgress } from '@/lib/goalProgress'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { usePreferences } from '@/stores/preferences'
import YearTotalCard from '@/features/progress/components/YearTotalCard'
import useServiceYearTotal from '@/features/progress/hooks/useServiceYearTotal'
import StatCard from '@/features/progress/components/cards/StatCard'
import { formatGoalHours } from '@/features/progress/components/cards/displayMinutes'
import type { ProgressCardProps } from '@/features/progress/components/cards/types'

export default function ServiceYearCard({
  month,
  year,
  size,
}: ProgressCardProps) {
  const theme = useTheme()
  const serviceYear = serviceYearOf({ month, year })
  const { hasAnnualGoal, annualGoalHours } = usePublisher({ month, year })
  const timeDisplayFormat = usePreferences((s) => s.timeDisplayFormat)
  const total = useServiceYearTotal(serviceYear)
  const localDay = useLocalDay()

  if (size !== 'small') {
    return hasAnnualGoal ? (
      <YearMilestoneCard year={serviceYear + 1} />
    ) : (
      <YearTotalCard year={serviceYear + 1} />
    )
  }

  const goalMinutes = hasAnnualGoal ? annualGoalHours * 60 : 0
  const { end } = serviceYearBounds(serviceYear)
  const today = moment(localDay, 'YYYY-MM-DD')
  const isCurrent = isInServiceYear(today, serviceYear)

  return (
    <StatCard
      icon={CalendarRangeIcon}
      title={i18n.t('serviceYear')}
      value={formatMinutes(total, timeDisplayFormat).formatted}
      suffix={
        goalMinutes
          ? i18n.t('progressCards.ofGoal', {
              goal: formatGoalHours(goalMinutes),
            })
          : undefined
      }
      caption={
        isCurrent
          ? i18n.t('daysLeftCount', { count: end.diff(today, 'days') })
          : `${serviceYear}–${serviceYear + 1}`
      }
      footer={
        goalMinutes ? (
          <SimpleProgressBar
            percentage={goalProgress({ minutes: total, goalMinutes }).fraction}
            color={theme.colors.accent}
            height={6}
            animated={false}
          />
        ) : undefined
      }
      size={size}
    />
  )
}
