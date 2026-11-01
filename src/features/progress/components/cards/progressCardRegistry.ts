import type { ComponentType } from 'react'
import {
  BookOpenCheck as StudyIcon,
  CalendarCheck as CalendarCheckIcon,
  CalendarDays as CalendarDaysIcon,
  CalendarRange as CalendarRangeIcon,
  Car as CarIcon,
  ChartColumn as ChartColumnIcon,
  ChartLine as ChartLineIcon,
  Flame as FlameIcon,
  Gauge as GaugeIcon,
  HandHeart as CreditIcon,
  Infinity as InfinityIcon,
  MessagesSquare as VisitsIcon,
  TrendingUp as TrendingUpIcon,
} from 'lucide-react-native'
import type { AppIcon } from '@/components/ui/LucideIcon'
import i18n from '@/lib/locales'
import type { ProgressCardId } from '@/lib/progressCards'
import type { ProgressCardProps } from '@/features/progress/components/cards/types'
import DailyPaceCard from '@/features/progress/components/cards/DailyPaceCard'
import BibleStudiesCard from '@/features/progress/components/cards/BibleStudiesCard'
import ServiceDaysCard from '@/features/progress/components/cards/ServiceDaysCard'
import VisitsCard from '@/features/progress/components/cards/VisitsCard'
import CreditCard from '@/features/progress/components/cards/CreditCard'
import WeeksCard from '@/features/progress/components/cards/WeeksCard'
import ProjectedCard from '@/features/progress/components/cards/ProjectedCard'
import ServiceYearCard from '@/features/progress/components/cards/ServiceYearCard'
import YearPaceCard from '@/features/progress/components/cards/YearPaceCard'
import StreakCard from '@/features/progress/components/cards/StreakCard'
import LifetimeCard from '@/features/progress/components/cards/LifetimeCard'
import MileageCard from '@/features/progress/components/cards/MileageCard'
import DaysCard from '@/features/progress/components/cards/DaysCard'

export type ProgressCardGroup = 'month' | 'serviceYear' | 'more'

export const PROGRESS_CARD_GROUPS: {
  group: ProgressCardGroup
  title: () => string
}[] = [
  { group: 'month', title: () => i18n.t('progressCards.group.month') },
  {
    group: 'serviceYear',
    title: () => i18n.t('progressCards.group.serviceYear'),
  },
  { group: 'more', title: () => i18n.t('progressCards.group.more') },
]

export type ProgressCardDestination = 'year' | 'allTime' | 'mileage'

export type ProgressCardMeta<Group extends string> = {
  group: Group
  icon: AppIcon
  title: () => string

  description: () => string
}

export type ProgressCardDefinition = ProgressCardMeta<ProgressCardGroup> & {
  id: ProgressCardId
  Component: ComponentType<ProgressCardProps>

  ownEditTrigger?: boolean

  destination?: ProgressCardDestination
}

export const PROGRESS_CARDS: Record<ProgressCardId, ProgressCardDefinition> = {
  dailyPace: {
    id: 'dailyPace',
    group: 'month',
    icon: GaugeIcon,
    title: () => i18n.t('progressCards.dailyPace.title'),
    description: () => i18n.t('progressCards.dailyPace.description'),
    Component: DailyPaceCard,
  },
  studies: {
    id: 'studies',
    group: 'month',
    icon: StudyIcon,
    title: () => i18n.t('studies'),
    description: () => i18n.t('progressCards.studies.description'),
    Component: BibleStudiesCard,
  },
  serviceDays: {
    id: 'serviceDays',
    group: 'month',
    icon: CalendarCheckIcon,
    title: () => i18n.t('progressCards.serviceDays.title'),
    description: () => i18n.t('progressCards.serviceDays.description'),
    Component: ServiceDaysCard,
  },
  visits: {
    id: 'visits',
    group: 'month',
    icon: VisitsIcon,
    title: () => i18n.t('progressCards.visits.title'),
    description: () => i18n.t('progressCards.visits.description'),
    Component: VisitsCard,
  },
  credit: {
    id: 'credit',
    group: 'month',
    icon: CreditIcon,
    title: () => i18n.t('progressCards.credit.title'),
    description: () => i18n.t('progressCards.credit.description'),
    Component: CreditCard,
  },
  weeks: {
    id: 'weeks',
    group: 'month',
    icon: ChartColumnIcon,
    title: () => i18n.t('progressCards.weeks.title'),
    description: () => i18n.t('progressCards.weeks.description'),
    Component: WeeksCard,
  },
  projected: {
    id: 'projected',
    group: 'month',
    icon: ChartLineIcon,
    title: () => i18n.t('projectedTotal.headerMonth'),
    description: () => i18n.t('progressCards.projected.description'),
    Component: ProjectedCard,
  },
  days: {
    id: 'days',
    group: 'month',
    icon: CalendarDaysIcon,
    title: () => i18n.t('progressCards.days.title'),
    description: () => i18n.t('progressCards.days.description'),
    Component: DaysCard,
    ownEditTrigger: true,
  },
  serviceYear: {
    id: 'serviceYear',
    group: 'serviceYear',
    icon: CalendarRangeIcon,
    title: () => i18n.t('serviceYear'),
    description: () => i18n.t('progressCards.serviceYear.description'),
    Component: ServiceYearCard,
    destination: 'year',
  },
  yearPace: {
    id: 'yearPace',
    group: 'serviceYear',
    icon: TrendingUpIcon,
    title: () => i18n.t('progressCards.yearPace.title'),
    description: () => i18n.t('progressCards.yearPace.description'),
    Component: YearPaceCard,
    destination: 'year',
  },
  streak: {
    id: 'streak',
    group: 'more',
    icon: FlameIcon,
    title: () => i18n.t('streak_title'),
    description: () => i18n.t('progressCards.streak.description'),
    Component: StreakCard,
  },
  lifetime: {
    id: 'lifetime',
    group: 'more',
    icon: InfinityIcon,
    title: () => i18n.t('progressCards.lifetime.title'),
    description: () => i18n.t('progressCards.lifetime.description'),
    Component: LifetimeCard,
    destination: 'allTime',
  },
  mileage: {
    id: 'mileage',
    group: 'more',
    icon: CarIcon,
    title: () => i18n.t('mileage.title'),
    description: () => i18n.t('progressCards.mileage.description'),
    Component: MileageCard,
    destination: 'mileage',
  },
}
