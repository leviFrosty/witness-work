import { Gauge as GaugeIcon } from 'lucide-react-native'
import moment from 'moment'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { usePreferences } from '@/stores/preferences'
import { formatDisplay } from '@/lib/dates'
import { dailyPace } from '@/features/progress/lib/progressCardStats'
import useMonthProgress from '@/features/progress/hooks/useMonthProgress'
import StatCard from '@/features/progress/components/cards/StatCard'
import {
  formatGoalHours,
  formatNeededMinutes,
} from '@/features/progress/components/cards/displayMinutes'
import type { ProgressCardProps } from '@/features/progress/components/cards/types'

export default function DailyPaceCard({
  month,
  year,
  size,
}: ProgressCardProps) {
  const timeDisplayFormat = usePreferences((s) => s.timeDisplayFormat)
  const { today, adjusted, goalMinutes } = useMonthProgress(month, year)
  const pace = dailyPace({
    loggedMinutes: adjusted.value,
    goalMinutes,
    month,
    year,
    today,
  })
  if (!pace) return null

  const goal = formatGoalHours(goalMinutes)
  const needed = (minutes: number) =>
    formatNeededMinutes(minutes, timeDisplayFormat)
  const common = {
    icon: GaugeIcon,
    title: i18n.t('progressCards.dailyPace.title'),
    info: i18n.t('progressCards.dailyPace.info'),
    size,
  }

  switch (pace.state) {
    case 'current':
      return (
        <StatCard
          {...common}
          value={needed(pace.perDayMinutes)}
          suffix={i18n.t('perDay')}
          caption={
            pace.daysLeft === 0
              ? i18n.t('progressCards.dailyPace.lastDay', { goal })
              : i18n.t('progressCards.dailyPace.current', {
                  count: pace.daysLeft,
                  goal,
                })
          }
          detail={
            pace.perWeekMinutes !== null
              ? i18n.t('progressCards.dailyPace.perWeek', {
                  value: needed(pace.perWeekMinutes),
                })
              : undefined
          }
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
              ? i18n.t('beyondGoalShort', {
                  value: formatMinutes(pace.overMinutes, timeDisplayFormat)
                    .formatted,
                })
              : i18n.t('progressCards.dailyPace.nothingLeft')
          }
        />
      )
    case 'future':
      return (
        <StatCard
          {...common}
          value={needed(pace.perDayMinutes)}
          suffix={i18n.t('perDay')}
          tone='muted'
          caption={i18n.t('progressCards.dailyPace.future', {
            goal,
            month: formatDisplay(moment({ year, month, day: 1 }), 'MMMM'),
          })}
          detail={i18n.t('progressCards.dailyPace.perWeek', {
            value: needed(pace.perWeekMinutes),
          })}
        />
      )
    case 'past':
      return (
        <StatCard
          {...common}
          value={
            formatMinutes(pace.averagePerDayMinutes, timeDisplayFormat)
              .formatted
          }
          tone='muted'
          caption={i18n.t('progressCards.dailyPace.past', {
            value: formatMinutes(pace.shortMinutes, timeDisplayFormat)
              .formatted,
            goal,
          })}
        />
      )
  }
}
