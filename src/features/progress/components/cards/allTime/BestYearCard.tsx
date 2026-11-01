import { Award as AwardIcon } from 'lucide-react-native'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { usePreferences } from '@/stores/preferences'
import StatCard from '@/features/progress/components/cards/StatCard'
import useServiceYearTotals from '@/features/progress/components/cards/allTime/useServiceYearTotals'
import { serviceYearLabel } from '@/features/progress/components/cards/allTime/serviceYearLabel'
import type { AllTimeCardProps } from '@/features/progress/components/cards/types'

export default function BestYearCard({ size }: AllTimeCardProps) {
  const timeDisplayFormat = usePreferences((s) => s.timeDisplayFormat)
  const best = useServiceYearTotals().reduce<{
    endYear: number
    minutes: number
  } | null>(
    (top, y) => (y.minutes > 0 && y.minutes > (top?.minutes ?? 0) ? y : top),
    null
  )

  return (
    <StatCard
      icon={AwardIcon}
      title={i18n.t('progressCards.allTime.bestYear.title')}
      value={formatMinutes(best?.minutes ?? 0, timeDisplayFormat).formatted}
      tone={best ? 'default' : 'muted'}
      caption={
        best
          ? serviceYearLabel(best.endYear)
          : i18n.t('progressCards.serviceDays.none')
      }
      info={i18n.t('progressCards.allTime.rawInfo')}
      size={size}
    />
  )
}
