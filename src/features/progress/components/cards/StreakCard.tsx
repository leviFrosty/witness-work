import { Flame as FlameIcon } from 'lucide-react-native'
import i18n from '@/lib/locales'
import { formatNumber } from '@/lib/numbers'
import useServiceStreak from '@/hooks/useServiceStreak'
import StatCard from '@/features/progress/components/cards/StatCard'
import type { ProgressCardProps } from '@/features/progress/components/cards/types'

/** The Service Streak as it stands today, whichever month is shown. */
export default function StreakCard({ size }: ProgressCardProps) {
  const streak = useServiceStreak()
  const count = streak.count
  const months = streak.kind === 'months'

  return (
    <StatCard
      icon={FlameIcon}
      title={i18n.t('streak_title')}
      value={formatNumber(count)}
      tone={count ? 'default' : 'muted'}
      caption={
        count
          ? months
            ? i18n.t('progressCards.streak.months')
            : i18n.t('progressCards.streak.plans')
          : months
            ? i18n.t('progressCards.streak.noneMonths')
            : i18n.t('progressCards.streak.none')
      }
      info={
        months
          ? i18n.t('streakCelebration_captionMonths')
          : i18n.t('streakCelebration_captionPlans')
      }
      size={size}
    />
  )
}
