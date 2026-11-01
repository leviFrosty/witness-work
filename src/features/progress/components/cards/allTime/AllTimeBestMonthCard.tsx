import { Trophy as TrophyIcon } from 'lucide-react-native'
import i18n from '@/lib/locales'
import { formatDisplay } from '@/lib/dates'
import { formatMinutes } from '@/lib/minutes'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import {
  allMonthTotals,
  bestMonth,
} from '@/features/progress/lib/periodCardStats'
import StatCard from '@/features/progress/components/cards/StatCard'
import type { AllTimeCardProps } from '@/features/progress/components/cards/types'

export default function AllTimeBestMonthCard({ size }: AllTimeCardProps) {
  const timeDisplayFormat = usePreferences((s) => s.timeDisplayFormat)
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const best = bestMonth(allMonthTotals(serviceReports))

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
