import i18n from '@/lib/locales'
import { formatNumber } from '@/lib/numbers'
import { getServiceYearFromDate } from '@/lib/serviceYear'
import PeopleStudiedStatCard from '@/features/progress/components/cards/PeopleStudiedStatCard'
import type { YearCardProps } from '@/features/progress/components/cards/types'

export default function YearStudiesCard({ serviceYear, size }: YearCardProps) {
  return (
    <PeopleStudiedStatCard
      inRange={(date) => getServiceYearFromDate(date) === serviceYear}
      peakCaption={(peak) =>
        i18n.t('progressCards.year.studies.peak', {
          value: formatNumber(peak.count),
        })
      }
      none={i18n.t('progressCards.year.studies.none')}
      info={i18n.t('progressCards.year.studies.info')}
      size={size}
    />
  )
}
