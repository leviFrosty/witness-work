import { CalendarCheck as CalendarCheckIcon } from 'lucide-react-native'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { formatNumber } from '@/lib/numbers'
import { formatMonthDayCompact } from '@/lib/dates'
import { usePreferences } from '@/stores/preferences'
import moment from 'moment'
import { serviceDayStats } from '@/features/progress/lib/progressCardStats'
import useMonthProgress from '@/features/progress/hooks/useMonthProgress'
import StatCard from '@/features/progress/components/cards/StatCard'
import type { ProgressCardProps } from '@/features/progress/components/cards/types'
import type { ProgressCardSize } from '@/lib/progressCards'
import type { TimeEntry } from '@/types/timeEntry'

export default function ServiceDaysCard({
  month,
  year,
  size,
}: ProgressCardProps) {
  const { reports } = useMonthProgress(month, year)
  return <ServiceDaysStatCard reports={reports} size={size} />
}

export function ServiceDaysStatCard({
  reports,
  size,
}: {
  reports: TimeEntry[]
  size: ProgressCardSize
}) {
  const timeDisplayFormat = usePreferences((s) => s.timeDisplayFormat)
  const stats = serviceDayStats(reports)

  return (
    <StatCard
      icon={CalendarCheckIcon}
      title={i18n.t('progressCards.serviceDays.title')}
      value={formatNumber(stats.days)}
      suffix={i18n.t('progressCards.serviceDays.unit', { count: stats.days })}
      tone={stats.days ? 'default' : 'muted'}
      caption={
        stats.days
          ? i18n.t('progressCards.serviceDays.average', {
              value: formatMinutes(stats.averageMinutes, timeDisplayFormat)
                .formatted,
            })
          : i18n.t('progressCards.serviceDays.none')
      }
      detail={
        stats.bestDay
          ? i18n.t('progressCards.serviceDays.best', {
              value: formatMinutes(stats.bestDay.minutes, timeDisplayFormat)
                .formatted,
              date: formatMonthDayCompact(
                moment(stats.bestDay.day, 'YYYY-MM-DD')
              ),
            })
          : undefined
      }
      size={size}
    />
  )
}
