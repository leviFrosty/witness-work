import { Infinity as InfinityIcon } from 'lucide-react-native'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { formatDisplay } from '@/lib/dates'
import { momentStoredDate } from '@/lib/normalizeDate'
import { getEarliestReportDate, getLifetimeMinutes } from '@/lib/serviceReport'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import StatCard from '@/features/progress/components/cards/StatCard'
import type { ProgressCardProps } from '@/features/progress/components/cards/types'
import type { TimeEntry } from '@/types/timeEntry'

export default function LifetimeCard({ size }: ProgressCardProps) {
  const timeDisplayFormat = usePreferences((s) => s.timeDisplayFormat)
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const entries: TimeEntry[] = Object.values(serviceReports).flatMap((months) =>
    Object.values(months).flat()
  )
  const minutes = getLifetimeMinutes(entries)
  const since = getEarliestReportDate(entries)

  return (
    <StatCard
      icon={InfinityIcon}
      title={i18n.t('progressCards.lifetime.title')}
      value={formatMinutes(minutes, timeDisplayFormat).formatted}
      tone={minutes ? 'default' : 'muted'}
      caption={
        since
          ? i18n.t('progressCards.lifetime.since', {
              date: formatDisplay(momentStoredDate(since), 'MMM YYYY'),
            })
          : undefined
      }
      info={i18n.t('lifetimeHoursInfo')}
      size={size}
    />
  )
}
