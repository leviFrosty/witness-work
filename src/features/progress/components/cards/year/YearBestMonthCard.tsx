import { Trophy as TrophyIcon } from 'lucide-react-native'
import i18n from '@/lib/locales'
import { formatDisplay } from '@/lib/dates'
import { formatMinutes } from '@/lib/minutes'
import { usePreferences } from '@/stores/preferences'
import { bestMonth } from '@/features/progress/lib/periodCardStats'
import { useServiceYearMonthTotals } from '@/features/progress/hooks/usePeriodCardData'
import StatCard from '@/features/progress/components/cards/StatCard'
import type { YearCardProps } from '@/features/progress/components/cards/types'

export default function YearBestMonthCard({
  serviceYear,
  size,
}: YearCardProps) {
  const timeDisplayFormat = usePreferences((s) => s.timeDisplayFormat)
  const best = bestMonth(useServiceYearMonthTotals(serviceYear))

  return (
    <StatCard
      icon={TrophyIcon}
      title={i18n.t('progressCards.bestMonth.title')}
      value={formatMinutes(best?.minutes ?? 0, timeDisplayFormat).formatted}
      tone={best ? 'default' : 'muted'}
      caption={
        best
          ? formatDisplay({ year: best.year, month: best.month }, 'MMMM YYYY')
          : i18n.t('progressCards.serviceDays.none')
      }
      size={size}
    />
  )
}
