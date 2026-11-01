import { History as HistoryIcon } from 'lucide-react-native'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { usePreferences } from '@/stores/preferences'
import useServiceYearPace from '@/features/progress/hooks/useServiceYearPace'
import StatCard from '@/features/progress/components/cards/StatCard'
import type { YearCardProps } from '@/features/progress/components/cards/types'

const EVEN_MINUTES = 30

export default function LastYearCard({ serviceYear, size }: YearCardProps) {
  const timeDisplayFormat = usePreferences((s) => s.timeDisplayFormat)
  const { pace } = useServiceYearPace(serviceYear)
  const format = (minutes: number) =>
    formatMinutes(Math.abs(minutes), timeDisplayFormat).formatted
  const common = {
    icon: HistoryIcon,
    title: i18n.t('progressCards.year.lastYear.title'),
    info: i18n.t('progressCards.year.lastYear.info'),
    size,
  }

  const lastYear = pace.lastYearToDateMinutes
  if (lastYear === null || pace.tense === 'future') {
    return (
      <StatCard
        {...common}
        value={format(0)}
        tone='muted'
        caption={
          lastYear === null
            ? i18n.t('progressCards.year.lastYear.none')
            : i18n.t('progressCards.year.lastYear.future')
        }
      />
    )
  }

  const delta = pace.loggedMinutes - lastYear
  const even = Math.abs(delta) < EVEN_MINUTES
  const past = pace.tense === 'past'
  return (
    <StatCard
      {...common}
      value={even ? format(0) : `${delta > 0 ? '+' : '-'}${format(delta)}`}
      tone={!even && delta > 0 ? 'accent' : 'default'}
      caption={
        even
          ? i18n.t('serviceYearPace.evenWithLastYear')
          : delta > 0
            ? i18n.t(
                past
                  ? 'progressCards.year.lastYear.morePast'
                  : 'progressCards.year.lastYear.ahead'
              )
            : i18n.t(
                past
                  ? 'progressCards.year.lastYear.lessPast'
                  : 'progressCards.year.lastYear.behind'
              )
      }
      detail={i18n.t('progressCards.year.lastYear.detail', {
        thisYear: format(pace.loggedMinutes),
        lastYear: format(lastYear),
      })}
    />
  )
}
