import type { ComponentType } from 'react'
import {
  BookUser as BookUserIcon,
  CalendarDays as CalendarDaysIcon,
  CalendarSync as CalendarSyncIcon,
  Car as CarIcon,
  CirclePlus as CirclePlusIcon,
  HardDriveDownload as HardDriveDownloadIcon,
  LayoutGrid as LayoutGridIcon,
  Medal as MedalIcon,
  Moon as MoonIcon,
  Send as SendIcon,
  Timer as TimerIcon,
  Users as UsersIcon,
  Watch as WatchIcon,
} from 'lucide-react-native'
import type { AppIcon } from '@/components/ui/LucideIcon'
import type { TranslationKey } from '@/lib/locales'
import type { RevealColor } from '@/features/updates/constants/updateRevealPages'
import type { RevealVisualProps } from '@/features/updates/components/reveal/visuals/kit'
import TimeVisual from '@/features/onboarding/components/tour/TimeVisual'
import VisitsVisual from '@/features/onboarding/components/tour/VisitsVisual'
import PlanVisual from '@/features/onboarding/components/tour/PlanVisual'
import ReportVisual from '@/features/onboarding/components/tour/ReportVisual'

export type TourPageId = 'track' | 'contacts' | 'plan' | 'report' | 'more'

export interface TourPageSpec {
  id: TourPageId
  icon: AppIcon
  color: RevealColor
  titleKey: TranslationKey
  captionKey: TranslationKey

  Visual?: ComponentType<RevealVisualProps>
}

export const TOUR_PAGES: TourPageSpec[] = [
  {
    id: 'track',
    icon: TimerIcon,
    color: 'accent',
    titleKey: 'onboardingTour_track_title',
    captionKey: 'onboardingTour_track_caption',
    Visual: TimeVisual,
  },
  {
    id: 'contacts',
    icon: BookUserIcon,
    color: 'indigo',
    titleKey: 'onboardingTour_contacts_title',
    captionKey: 'onboardingTour_contacts_caption',
    Visual: VisitsVisual,
  },
  {
    id: 'plan',
    icon: CalendarDaysIcon,
    color: 'cyan',
    titleKey: 'onboardingTour_plan_title',
    captionKey: 'onboardingTour_plan_caption',
    Visual: PlanVisual,
  },
  {
    id: 'report',
    icon: SendIcon,
    color: 'orange',
    titleKey: 'onboardingTour_report_title',
    captionKey: 'onboardingTour_report_caption',
    Visual: ReportVisual,
  },
  {
    id: 'more',
    icon: CirclePlusIcon,
    color: 'accent2',
    titleKey: 'onboardingTour_more_title',
    captionKey: 'onboardingTour_more_caption',
  },
]

export interface TourMoreItem {
  id: string
  icon: AppIcon
  color: RevealColor
  labelKey: TranslationKey
  platform?: 'ios' | 'android'

  buddiesOnly?: boolean

  watchOnly?: boolean

  calendarOnly?: boolean
}

export const TOUR_MORE_LIMIT = 6

export const TOUR_MORE_ITEMS: TourMoreItem[] = [
  {
    id: 'buddies',
    icon: UsersIcon,
    color: 'info',
    labelKey: 'buddies_title',
    buddiesOnly: true,
  },
  {
    id: 'badges',
    icon: MedalIcon,
    color: 'warn',
    labelKey: 'badges_title',
  },
  {
    id: 'widgets',
    icon: LayoutGridIcon,
    color: 'accent',
    labelKey: 'onboardingTour_more_widgets',
    platform: 'ios',
  },
  {
    id: 'watch',
    icon: WatchIcon,
    color: 'pink',
    labelKey: 'onboardingTour_more_watch',
    platform: 'ios',
    watchOnly: true,
  },
  {
    id: 'calendar',
    icon: CalendarSyncIcon,
    color: 'purple',
    labelKey: 'onboardingTour_more_calendar',
    calendarOnly: true,
  },
  {
    id: 'backups',
    icon: HardDriveDownloadIcon,
    color: 'cyan',
    labelKey: 'onboardingTour_more_backups',
  },
  {
    id: 'mileage',
    icon: CarIcon,
    color: 'teal',
    labelKey: 'onboardingTour_more_mileage',
  },
  {
    id: 'darkMode',
    icon: MoonIcon,
    color: 'indigo',
    labelKey: 'onboardingTour_more_darkMode',
    platform: 'android',
  },
]

export const tourMoreItems = (
  available: {
    buddies: boolean
    watch: boolean
    calendar: boolean
  },
  onPlatform: (platform?: 'ios' | 'android') => boolean
): TourMoreItem[] =>
  TOUR_MORE_ITEMS.filter(
    (item) =>
      onPlatform(item.platform) &&
      (!item.buddiesOnly || available.buddies) &&
      (!item.watchOnly || available.watch) &&
      (!item.calendarOnly || available.calendar)
  ).slice(0, TOUR_MORE_LIMIT)
