import type { ComponentType } from 'react'
import {
  Award as AwardIcon,
  BookOpenCheck as StudyIcon,
  CalendarCheck as CalendarCheckIcon,
  CalendarHeart as CalendarHeartIcon,
  Car as CarIcon,
  MessagesSquare as VisitsIcon,
  Sigma as SigmaIcon,
  Trophy as TrophyIcon,
} from 'lucide-react-native'
import i18n from '@/lib/locales'
import type { AllTimeCardId } from '@/lib/progressCards'
import type { AllTimeCardProps } from '@/features/progress/components/cards/types'
import type {
  ProgressCardDestination,
  ProgressCardMeta,
} from '@/features/progress/components/cards/progressCardRegistry'
import BestYearCard from '@/features/progress/components/cards/allTime/BestYearCard'
import YearlyAverageCard from '@/features/progress/components/cards/allTime/YearlyAverageCard'
import AllTimeBestMonthCard from '@/features/progress/components/cards/allTime/AllTimeBestMonthCard'
import AllTimeMonthsSharedCard from '@/features/progress/components/cards/allTime/AllTimeMonthsSharedCard'
import AllTimeStudiesCard from '@/features/progress/components/cards/allTime/AllTimeStudiesCard'
import AllTimeVisitsCard from '@/features/progress/components/cards/allTime/AllTimeVisitsCard'
import AllTimeServiceDaysCard from '@/features/progress/components/cards/allTime/AllTimeServiceDaysCard'
import AllTimeMileageCard from '@/features/progress/components/cards/allTime/AllTimeMileageCard'

export type AllTimeCardGroup = 'time' | 'ministry'

export const ALL_TIME_CARD_GROUPS: {
  group: AllTimeCardGroup
  title: () => string
}[] = [
  { group: 'time', title: () => i18n.t('progressCards.group.time') },
  { group: 'ministry', title: () => i18n.t('progressCards.group.ministry') },
]

export type AllTimeCardDefinition = ProgressCardMeta<AllTimeCardGroup> & {
  Component: ComponentType<AllTimeCardProps>
  destination?: ProgressCardDestination
}

export const ALL_TIME_PROGRESS_CARDS: Record<
  AllTimeCardId,
  AllTimeCardDefinition
> = {
  bestYear: {
    group: 'time',
    icon: AwardIcon,
    title: () => i18n.t('progressCards.allTime.bestYear.title'),
    description: () => i18n.t('progressCards.allTime.bestYear.description'),
    Component: BestYearCard,
  },
  yearlyAverage: {
    group: 'time',
    icon: SigmaIcon,
    title: () => i18n.t('progressCards.allTime.yearlyAverage.title'),
    description: () =>
      i18n.t('progressCards.allTime.yearlyAverage.description'),
    Component: YearlyAverageCard,
  },
  bestMonth: {
    group: 'time',
    icon: TrophyIcon,
    title: () => i18n.t('progressCards.bestMonth.title'),
    description: () => i18n.t('progressCards.allTime.bestMonth.description'),
    Component: AllTimeBestMonthCard,
  },
  serviceDays: {
    group: 'time',
    icon: CalendarCheckIcon,
    title: () => i18n.t('progressCards.serviceDays.title'),
    description: () => i18n.t('progressCards.allTime.serviceDays.description'),
    Component: AllTimeServiceDaysCard,
  },
  monthsShared: {
    group: 'ministry',
    icon: CalendarHeartIcon,
    title: () => i18n.t('progressCards.monthsShared.title'),
    description: () => i18n.t('progressCards.allTime.monthsShared.description'),
    Component: AllTimeMonthsSharedCard,
  },
  studies: {
    group: 'ministry',
    icon: StudyIcon,
    title: () => i18n.t('studies'),
    description: () => i18n.t('progressCards.allTime.studies.description'),
    Component: AllTimeStudiesCard,
  },
  visits: {
    group: 'ministry',
    icon: VisitsIcon,
    title: () => i18n.t('progressCards.visits.title'),
    description: () => i18n.t('progressCards.allTime.visits.description'),
    Component: AllTimeVisitsCard,
  },
  mileage: {
    group: 'ministry',
    icon: CarIcon,
    title: () => i18n.t('mileage.title'),
    description: () => i18n.t('progressCards.allTime.mileage.description'),
    Component: AllTimeMileageCard,
    destination: 'mileage',
  },
}
