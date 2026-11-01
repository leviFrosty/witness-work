import { HandHeart as CreditIcon } from 'lucide-react-native'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { usePreferences } from '@/stores/preferences'
import useMonthProgress from '@/features/progress/hooks/useMonthProgress'
import StatCard from '@/features/progress/components/cards/StatCard'
import { formatGoalHours } from '@/features/progress/components/cards/displayMinutes'
import type { ProgressCardProps } from '@/features/progress/components/cards/types'

export default function CreditCard({ month, year, size }: ProgressCardProps) {
  const timeDisplayFormat = usePreferences((s) => s.timeDisplayFormat)
  const { adjusted, publisher } = useMonthProgress(month, year)
  const cap = publisher.creditCapMinutes
  const format = (minutes: number) =>
    formatMinutes(minutes, timeDisplayFormat).formatted
  const logged = adjusted.credit + adjusted.creditOverage

  return (
    <StatCard
      icon={CreditIcon}
      title={i18n.t('progressCards.credit.title')}
      value={format(adjusted.credit)}
      tone={logged ? 'default' : 'muted'}
      caption={
        adjusted.creditOverage > 0
          ? i18n.t('progressCards.credit.over', {
              value: format(adjusted.creditOverage),
            })
          : cap === null
            ? i18n.t('progressCards.credit.noLimit')
            : i18n.t('progressCards.credit.limit', {
                value: formatGoalHours(cap),
              })
      }
      detail={
        adjusted.creditOverage > 0
          ? i18n.t('progressCards.credit.logged', { value: format(logged) })
          : undefined
      }
      info={i18n.t('progressCards.credit.info')}
      size={size}
    />
  )
}
