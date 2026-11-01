import type { ComponentType } from 'react'
import {
  BookOpenCheck as StudyIcon,
  CalendarCheck as CalendarCheckIcon,
  CalendarHeart as CalendarHeartIcon,
  Car as CarIcon,
  ChartColumn as ChartColumnIcon,
  ChartLine as ChartLineIcon,
  History as HistoryIcon,
  MessagesSquare as VisitsIcon,
  TrendingUp as TrendingUpIcon,
  Trophy as TrophyIcon,
} from 'lucide-react-native'
import i18n from '@/lib/locales'
import type { YearCardId } from '@/lib/progressCards'
import type { YearCardProps } from '@/features/progress/components/cards/types'
import type {
  ProgressCardDestination,
  ProgressCardMeta,
} from '@/features/progress/components/cards/progressCardRegistry'
import YearPaceChartCard from '@/features/progress/components/cards/year/YearPaceChartCard'
import YearNeededCard from '@/features/progress/components/cards/year/YearNeededCard'
import MonthlyAverageCard from '@/features/progress/components/cards/year/MonthlyAverageCard'
import YearBestMonthCard from '@/features/progress/components/cards/year/YearBestMonthCard'
import LastYearCard from '@/features/progress/components/cards/year/LastYearCard'
import YearMonthsSharedCard from '@/features/progress/components/cards/year/YearMonthsSharedCard'
import YearStudiesCard from '@/features/progress/components/cards/year/YearStudiesCard'
import YearVisitsCard from '@/features/progress/components/cards/year/YearVisitsCard'
import YearServiceDaysCard from '@/features/progress/components/cards/year/YearServiceDaysCard'
import YearMileageCard from '@/features/progress/components/cards/year/YearMileageCard'

export type YearCardGroup = 'time' | 'ministry'

export const YEAR_CARD_GROUPS: { group: YearCardGroup; title: () => string }[] =
  [
    { group: 'time', title: () => i18n.t('progressCards.group.time') },
    { group: 'ministry', title: () => i18n.t('progressCards.group.ministry') },
  ]

export type YearCardDefinition = ProgressCardMeta<YearCardGroup> & {
  Component: ComponentType<YearCardProps>
  destination?: ProgressCardDestination
}

export const YEAR_PROGRESS_CARDS: Record<YearCardId, YearCardDefinition> = {
  pace: {
    group: 'time',
    icon: ChartLineIcon,
    title: () => i18n.t('serviceYearPace.title'),
    description: () => i18n.t('progressCards.year.pace.description'),
    Component: YearPaceChartCard,
  },
  needed: {
    group: 'time',
    icon: TrendingUpIcon,
    title: () => i18n.t('progressCards.year.needed.title'),
    description: () => i18n.t('progressCards.yearPace.description'),
    Component: YearNeededCard,
  },
  monthlyAverage: {
    group: 'time',
    icon: ChartColumnIcon,
    title: () => i18n.t('progressCards.year.monthlyAverage.title'),
    description: () => i18n.t('progressCards.year.monthlyAverage.description'),
    Component: MonthlyAverageCard,
  },
  bestMonth: {
    group: 'time',
    icon: TrophyIcon,
    title: () => i18n.t('progressCards.bestMonth.title'),
    description: () => i18n.t('progressCards.year.bestMonth.description'),
    Component: YearBestMonthCard,
  },
  lastYear: {
    group: 'time',
    icon: HistoryIcon,
    title: () => i18n.t('progressCards.year.lastYear.title'),
    description: () => i18n.t('progressCards.year.lastYear.description'),
    Component: LastYearCard,
  },
  serviceDays: {
    group: 'time',
    icon: CalendarCheckIcon,
    title: () => i18n.t('progressCards.serviceDays.title'),
    description: () => i18n.t('progressCards.year.serviceDays.description'),
    Component: YearServiceDaysCard,
  },
  monthsShared: {
    group: 'ministry',
    icon: CalendarHeartIcon,
    title: () => i18n.t('progressCards.monthsShared.title'),
    description: () => i18n.t('progressCards.year.monthsShared.description'),
    Component: YearMonthsSharedCard,
  },
  studies: {
    group: 'ministry',
    icon: StudyIcon,
    title: () => i18n.t('studies'),
    description: () => i18n.t('progressCards.year.studies.description'),
    Component: YearStudiesCard,
  },
  visits: {
    group: 'ministry',
    icon: VisitsIcon,
    title: () => i18n.t('progressCards.visits.title'),
    description: () => i18n.t('progressCards.year.visits.description'),
    Component: YearVisitsCard,
  },
  mileage: {
    group: 'ministry',
    icon: CarIcon,
    title: () => i18n.t('mileage.title'),
    description: () => i18n.t('progressCards.year.mileage.description'),
    Component: YearMileageCard,
    destination: 'mileage',
  },
}
