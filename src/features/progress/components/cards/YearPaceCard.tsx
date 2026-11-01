import { TrendingUp as TrendingUpIcon } from 'lucide-react-native'
import usePublisher from '@/hooks/usePublisher'
import useLocalDay from '@/hooks/useLocalDay'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { usePreferences } from '@/stores/preferences'
import moment from 'moment'
import { yearPace } from '@/features/progress/lib/progressCardStats'
import useServiceYearTotal from '@/features/progress/hooks/useServiceYearTotal'
import StatCard from '@/features/progress/components/cards/StatCard'
import { serviceYearOf } from '@/lib/serviceYear'
import {
  formatGoalHours,
  formatNeededMinutes,
} from '@/features/progress/components/cards/displayMinutes'
import type { ProgressCardProps } from '@/features/progress/components/cards/types'

export default function YearPaceCard({
  month,
  year,
  size,
  title = i18n.t('progressCards.yearPace.title'),
}: ProgressCardProps & { title?: string }) {
  const today = moment(useLocalDay(), 'YYYY-MM-DD')
  const serviceYear = serviceYearOf({ month, year })
  const { annualGoalHours } = usePublisher({ month, year })
  const timeDisplayFormat = usePreferences((s) => s.timeDisplayFormat)
  const total = useServiceYearTotal(serviceYear)
  const goalMinutes = annualGoalHours * 60
  const pace = yearPace({
    loggedMinutes: total,
    goalMinutes,
    serviceYear,
    today,
  })
  if (!pace) return null

  const goal = formatGoalHours(goalMinutes)
  const format = (minutes: number) =>
    formatMinutes(minutes, timeDisplayFormat).formatted
  const common = {
    icon: TrendingUpIcon,
    title,
    info: i18n.t('progressCards.yearPace.info'),
    size,
  }

  switch (pace.state) {
    case 'current':
      return (
        <StatCard
          {...common}
          value={formatNeededMinutes(pace.perMonthMinutes, timeDisplayFormat)}
          suffix={i18n.t('progressCards.perMonth')}
          caption={i18n.t('progressCards.yearPace.current', {
            count: pace.monthsLeft,
            goal,
          })}
          detail={i18n.t('progressCards.yearPace.soFar', {
            value: format(total),
            goal,
          })}
        />
      )
    case 'met':
      return (
        <StatCard
          {...common}
          value={i18n.t('goalReached')}
          tone='accent'
          caption={
            pace.overMinutes > 0
              ? i18n.t('beyondGoalShort', { value: format(pace.overMinutes) })
              : goal
          }
        />
      )
    case 'future':
      return (
        <StatCard
          {...common}
          value={formatNeededMinutes(pace.perMonthMinutes, timeDisplayFormat)}
          suffix={i18n.t('progressCards.perMonth')}
          tone='muted'
          caption={i18n.t('progressCards.yearPace.future', { goal })}
        />
      )
    case 'past':
      return (
        <StatCard
          {...common}
          value={format(total)}
          tone='muted'
          caption={i18n.t('hrsShort', { value: format(pace.shortMinutes) })}
        />
      )
  }
}
