import type { ComponentType } from 'react'
import {
  AudioLines as AudioLinesIcon,
  BookUser as BookUserIcon,
  CalendarDays as CalendarDaysIcon,
  CalendarSync as CalendarSyncIcon,
  Car as CarIcon,
  ChartLine as ChartLineIcon,
  CirclePlus as CirclePlusIcon,
  Command as CommandIcon,
  HardDriveDownload as HardDriveDownloadIcon,
  Layers as LayersIcon,
  LayoutGrid as LayoutGridIcon,
  Map as MapIcon,
  Medal as MedalIcon,
  Moon as MoonIcon,
  PanelsLeftBottom as PanelsLeftBottomIcon,
  Send as SendIcon,
  ShieldCheck as ShieldCheckIcon,
  Timer as TimerIcon,
  Users as UsersIcon,
  Watch as WatchIcon,
} from 'lucide-react-native'
import type { AppIcon } from '@/components/ui/LucideIcon'
import type { TranslationKey } from '@/lib/locales'
import type {
  RevealColor,
  RevealMoreItem,
} from '@/features/updates/constants/updateRevealPages'
import type { RevealVisualProps } from '@/features/updates/components/reveal/visuals/kit'
import ContactsVisual from '@/features/updates/components/reveal/visuals/ContactsVisual'
import BuddiesVisual from '@/features/updates/components/reveal/visuals/BuddiesVisual'
import BadgesVisual from '@/features/updates/components/reveal/visuals/BadgesVisual'
import CalendarVisual from '@/features/updates/components/reveal/visuals/CalendarVisual'
import { HoursWatch } from '@/features/updates/components/reveal/visuals/WatchVisual'
import SiriVisual from '@/features/updates/components/reveal/visuals/SiriVisual'
import PlanVisual from '@/features/plans/components/schedule-intro/PlanVisual'
import TimeVisual from '@/features/onboarding/components/tour/TimeVisual'
import ReportVisual from '@/features/onboarding/components/tour/ReportVisual'
import PrivacyVisual from '@/features/onboarding/components/tour/PrivacyVisual'

/** One page of the onboarding tour. Its id is also its analytics value. */
export type TourPageId =
  | 'track'
  | 'plan'
  | 'contacts'
  | 'report'
  | 'buddies'
  | 'badges'
  | 'calendar'
  | 'watch'
  | 'siri'
  | 'privacy'
  | 'more'

export interface TourPageSpec {
  id: TourPageId
  icon: AppIcon
  color: RevealColor
  titleKey: TranslationKey
  captionKey: TranslationKey
  /** Caption for Android, where the iOS wording doesn't fit. */
  androidCaptionKey?: TranslationKey
  /** Caption where Buddies doesn't show. */
  noBuddiesCaptionKey?: TranslationKey
  /** A Siri phrase to call out beneath the caption. */
  siriPhraseKey?: TranslationKey
  /** Unset for "more", which draws its tiles. */
  Visual?: ComponentType<RevealVisualProps>
  /** Only on this platform. */
  platform?: 'ios' | 'android'
  /** Only where Buddies shows. */
  buddiesOnly?: boolean
  /** Only on an iPhone that can pair an Apple Watch. */
  watchOnly?: boolean
  /** Only on a build with the native calendar module. */
  calendarOnly?: boolean
}

/**
 * The tour a new user takes before setting anything up: what WitnessWork does,
 * in the order a month of service unfolds, then what makes it special. Pages
 * borrow the update reveal's illustrations where one already exists. The
 * publisher type isn't chosen yet, so every page shows the hours version.
 */
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
    id: 'plan',
    icon: CalendarDaysIcon,
    color: 'cyan',
    titleKey: 'onboardingTour_plan_title',
    captionKey: 'onboardingTour_plan_caption',
    Visual: PlanVisual,
  },
  {
    id: 'contacts',
    icon: BookUserIcon,
    color: 'indigo',
    titleKey: 'onboardingTour_contacts_title',
    captionKey: 'onboardingTour_contacts_caption',
    Visual: ContactsVisual,
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
    id: 'buddies',
    icon: UsersIcon,
    color: 'info',
    titleKey: 'onboardingTour_buddies_title',
    captionKey: 'onboardingTour_buddies_caption',
    Visual: BuddiesVisual,
    buddiesOnly: true,
  },
  {
    id: 'badges',
    icon: MedalIcon,
    color: 'warn',
    titleKey: 'updateReveal_badges_title',
    captionKey: 'updateReveal_badges_caption',
    noBuddiesCaptionKey: 'updateReveal_badges_captionNoBuddies',
    Visual: BadgesVisual,
  },
  {
    id: 'calendar',
    icon: CalendarSyncIcon,
    color: 'purple',
    titleKey: 'updateReveal_calendar_title',
    captionKey: 'updateReveal_calendar_caption',
    Visual: CalendarVisual,
    calendarOnly: true,
  },
  {
    id: 'watch',
    icon: WatchIcon,
    color: 'accent',
    titleKey: 'updateReveal_watch_title',
    captionKey: 'updateReveal_watch_caption',
    Visual: HoursWatch,
    platform: 'ios',
    watchOnly: true,
  },
  {
    id: 'siri',
    icon: AudioLinesIcon,
    color: 'pink',
    titleKey: 'updateReveal_siri_title',
    captionKey: 'updateReveal_siri_caption',
    siriPhraseKey: 'siriShortcutStartTimer',
    Visual: SiriVisual,
    platform: 'ios',
    watchOnly: true,
  },
  {
    id: 'privacy',
    icon: ShieldCheckIcon,
    color: 'purple',
    titleKey: 'privacyFirstTitle',
    captionKey: 'privacyFirstDesc',
    androidCaptionKey: 'privacyFirstDescAndroid',
    Visual: PrivacyVisual,
  },
  {
    id: 'more',
    icon: CirclePlusIcon,
    color: 'accent2',
    titleKey: 'updateReveal_more_title',
    captionKey: 'onboardingTour_more_caption',
  },
]

/**
 * The tour's "And so much more" tiles: free for everyone, so Supporter features
 * like cloud sync stay off it.
 */
export const TOUR_MORE_ITEMS: RevealMoreItem[] = [
  {
    id: 'map',
    icon: MapIcon,
    color: 'purple',
    labelKey: 'onboardingTour_more_map',
  },
  {
    id: 'mileage',
    icon: CarIcon,
    color: 'teal',
    labelKey: 'onboardingTour_more_mileage',
  },
  {
    id: 'yearPace',
    icon: ChartLineIcon,
    color: 'orange',
    labelKey: 'onboardingTour_more_yearPace',
  },
  {
    id: 'backups',
    icon: HardDriveDownloadIcon,
    color: 'cyan',
    labelKey: 'onboardingTour_more_backups',
  },
  {
    id: 'widgets',
    icon: LayoutGridIcon,
    color: 'accent',
    labelKey: 'onboardingTour_more_widgets',
    platform: 'ios',
  },
  {
    id: 'lockScreen',
    icon: TimerIcon,
    color: 'pink',
    labelKey: 'onboardingTour_more_lockScreen',
    platform: 'ios',
  },
  {
    id: 'darkMode',
    icon: MoonIcon,
    color: 'indigo',
    labelKey: 'onboardingTour_more_darkMode',
    platform: 'android',
  },
  {
    id: 'mapLayers',
    icon: LayersIcon,
    color: 'teal',
    labelKey: 'updateReveal_more_mapLayers',
    platform: 'android',
  },
  {
    id: 'tablets',
    icon: PanelsLeftBottomIcon,
    color: 'accent3',
    labelKey: 'onboardingTour_more_tablets',
    tabletOnly: true,
  },
  {
    id: 'shortcuts',
    icon: CommandIcon,
    color: 'accent2',
    labelKey: 'updateReveal_more_shortcuts',
    platform: 'ios',
    tabletOnly: true,
    // The iPad menu bar and its shortcuts need iOS 26.
    minIos: 26,
  },
]
