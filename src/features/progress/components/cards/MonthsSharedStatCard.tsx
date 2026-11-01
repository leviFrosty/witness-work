import { CalendarHeart as CalendarHeartIcon } from 'lucide-react-native'
import i18n from '@/lib/locales'
import { formatDisplay } from '@/lib/dates'
import { formatNumber } from '@/lib/numbers'
import type { ProgressCardSize } from '@/lib/progressCards'
import type { MonthsShared } from '@/features/progress/lib/periodCardStats'
import StatCard from '@/features/progress/components/cards/StatCard'

export default function MonthsSharedStatCard({
  stats,
  caption,
  size,
}: {
  stats: MonthsShared

  caption?: string
  size: ProgressCardSize
}) {
  const missed = stats.missed.length
  return (
    <StatCard
      icon={CalendarHeartIcon}
      title={i18n.t('progressCards.monthsShared.title')}
      value={formatNumber(stats.shared)}
      suffix={
        stats.months
          ? i18n.t('progressCards.monthsShared.of', {
              total: formatNumber(stats.months),
            })
          : undefined
      }
      tone={!stats.shared ? 'muted' : missed ? 'default' : 'accent'}
      caption={
        !stats.months
          ? i18n.t('progressCards.monthsShared.none')
          : (caption ??
            (missed
              ? i18n.t('progressCards.monthsShared.missed', { count: missed })
              : i18n.t('progressCards.monthsShared.every')))
      }
      detail={
        missed && missed <= 6
          ? i18n.t('progressCards.monthsShared.missedMonths', {
              months: stats.missed
                .map((m) => formatDisplay(m, 'MMM YYYY'))
                .join(', '),
            })
          : undefined
      }
      size={size}
    />
  )
}
