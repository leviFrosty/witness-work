import i18n from '@/lib/locales'
import { formatDisplay } from '@/lib/dates'
import { formatNumber } from '@/lib/numbers'
import PeopleStudiedStatCard from '@/features/progress/components/cards/PeopleStudiedStatCard'
import type { AllTimeCardProps } from '@/features/progress/components/cards/types'

/** Everyone the User has studied with, and their busiest month of studies. */
export default function AllTimeStudiesCard({ size }: AllTimeCardProps) {
  return (
    <PeopleStudiedStatCard
      peakCaption={(peak) =>
        i18n.t('progressCards.allTime.studies.peak', {
          value: formatNumber(peak.count),
          month: formatDisplay(
            { year: peak.year, month: peak.month },
            'MMM YYYY'
          ),
        })
      }
      none={i18n.t('progressCards.allTime.studies.none')}
      info={i18n.t('progressCards.allTime.studies.info')}
      size={size}
    />
  )
}
