import {
  AudioLines as AudioLinesIcon,
  BookUser as BookUserIcon,
  Bell as BellIcon,
  CalendarSync as CalendarSyncIcon,
  CalendarCog as CalendarCogIcon,
  Car as CarIcon,
  ChartLine as ChartLineIcon,
  Command as CommandIcon,
  House as HouseIcon,
  Layers as LayersIcon,
  Map as MapIcon,
  MapPinned as MapPinnedIcon,
  PanelBottom as PanelBottomIcon,
  PanelsLeftBottom as PanelsLeftBottomIcon,
  Pointer as PointerIcon,
  Search as SearchIcon,
  Send as SendIcon,
  ShieldCheck as ShieldCheckIcon,
  Smartphone as SmartphoneIcon,
  Timer as TimerIcon,
  Users as UsersIcon,
  Watch as WatchIcon,
} from 'lucide-react-native'
import type { AppIcon } from '@/components/ui/LucideIcon'
import type { Theme } from '@/constants/theme'
import type { TranslationKey } from '@/lib/locales'

export type RevealColor = keyof Theme['colors']

/** One page of the tour. Its id is also its analytics value. */
export type RevealPageId =
  | 'navigation'
  | 'map'
  | 'buddies'
  | 'notifications'
  | 'home'
  | 'contacts'
  | 'year'
  | 'mileage'
  | 'calendar'
  | 'watch'
  | 'siri'
  | 'more'
  | 'android'

export interface RevealPageSpec {
  id: RevealPageId
  icon: AppIcon
  color: RevealColor
  titleKey: TranslationKey
  captionKey: TranslationKey
  /** Copy for Android, where the iOS wording doesn't fit. */
  android?: { titleKey: TranslationKey; captionKey: TranslationKey }
  /** Only on this platform. */
  platform?: 'ios' | 'android'
  /** Only for roles with an Annual Goal (the Year Pace card's own gate). */
  annualGoalOnly?: boolean
  /** Only where Buddies shows: its flag, on a binary that supports it. */
  buddiesOnly?: boolean
  /** Only on an iPhone that can pair an Apple Watch. */
  watchOnly?: boolean
  /** Only for roles that log hours (`showsTimeEntry`). */
  timeEntryOnly?: boolean
  /** Caption for roles that report with the checkbox instead of hours. */
  checkboxCaptionKey?: TranslationKey
  /** A Siri phrase to call out beneath the caption. */
  siriPhraseKey?: TranslationKey
}

/** The tour, in order. `useRevealPages` drops the ones that don't apply. */
export const REVEAL_PAGES: RevealPageSpec[] = [
  {
    id: 'navigation',
    icon: PanelBottomIcon,
    color: 'accent',
    titleKey: 'updateReveal_navigation_title',
    captionKey: 'updateReveal_navigation_caption',
  },
  {
    id: 'map',
    icon: MapIcon,
    color: 'purple',
    titleKey: 'updateReveal_map_title',
    captionKey: 'updateReveal_map_caption',
  },
  {
    id: 'buddies',
    icon: UsersIcon,
    color: 'info',
    titleKey: 'updateReveal_buddies_title',
    captionKey: 'updateReveal_buddies_caption',
    buddiesOnly: true,
  },
  {
    id: 'notifications',
    icon: BellIcon,
    color: 'pink',
    titleKey: 'updateReveal_notifications_title',
    captionKey: 'updateReveal_notifications_caption',
  },
  {
    id: 'home',
    icon: HouseIcon,
    color: 'cyan',
    titleKey: 'updateReveal_home_title',
    captionKey: 'updateReveal_home_caption',
  },
  {
    id: 'contacts',
    icon: BookUserIcon,
    color: 'indigo',
    titleKey: 'updateReveal_contacts_title',
    captionKey: 'updateReveal_contacts_caption',
  },
  {
    id: 'year',
    icon: ChartLineIcon,
    color: 'orange',
    titleKey: 'updateReveal_year_title',
    captionKey: 'updateReveal_year_caption',
    annualGoalOnly: true,
  },
  {
    id: 'mileage',
    icon: CarIcon,
    color: 'teal',
    titleKey: 'updateReveal_mileage_title',
    captionKey: 'updateReveal_mileage_caption',
  },
  {
    id: 'calendar',
    icon: CalendarSyncIcon,
    color: 'purple',
    titleKey: 'updateReveal_calendar_title',
    captionKey: 'updateReveal_calendar_caption',
    platform: 'ios',
  },
  {
    id: 'watch',
    icon: WatchIcon,
    color: 'accent',
    titleKey: 'updateReveal_watch_title',
    captionKey: 'updateReveal_watch_caption',
    checkboxCaptionKey: 'updateReveal_watch_captionCheckbox',
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
    platform: 'ios',
    watchOnly: true,
    // Every Siri action adds or times hours.
    timeEntryOnly: true,
  },
  {
    id: 'more',
    icon: PointerIcon,
    color: 'accent2',
    titleKey: 'updateReveal_more_title',
    captionKey: 'updateReveal_more_caption',
  },
  {
    id: 'android',
    icon: SmartphoneIcon,
    color: 'accent',
    titleKey: 'updateReveal_android_title',
    captionKey: 'updateReveal_android_caption',
    android: {
      titleKey: 'updateReveal_android_titleAndroid',
      captionKey: 'updateReveal_android_captionAndroid',
    },
  },
]

/** One tile on the "And so much more" page. */
export interface RevealMoreItem {
  id: string
  icon: AppIcon
  color: RevealColor
  labelKey: TranslationKey
  platform?: 'ios' | 'android'
  /** Only on tablets. */
  tabletOnly?: boolean
  /** Lowest iOS major version it needs. */
  minIos?: number
}

export const REVEAL_MORE_ITEMS: RevealMoreItem[] = [
  {
    id: 'menus',
    icon: PointerIcon,
    color: 'indigo',
    labelKey: 'updateReveal_more_menus',
  },
  {
    id: 'mapLayers',
    icon: LayersIcon,
    color: 'teal',
    labelKey: 'updateReveal_more_mapLayers',
  },
  {
    id: 'monthStatus',
    icon: CalendarCogIcon,
    color: 'orange',
    labelKey: 'updateReveal_more_monthStatus',
  },
  {
    id: 'report',
    icon: SendIcon,
    color: 'accent',
    labelKey: 'updateReveal_more_report',
  },
  {
    id: 'help',
    icon: SearchIcon,
    color: 'cyan',
    labelKey: 'updateReveal_more_help',
  },
  {
    id: 'privacy',
    icon: ShieldCheckIcon,
    color: 'purple',
    labelKey: 'updateReveal_more_privacy',
  },
  {
    id: 'tablets',
    icon: PanelsLeftBottomIcon,
    color: 'accent3',
    labelKey: 'updateReveal_more_tablets',
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
  {
    id: 'timer',
    icon: TimerIcon,
    color: 'accent2',
    labelKey: 'updateReveal_more_timer',
    platform: 'android',
  },
  {
    id: 'googleMaps',
    icon: MapPinnedIcon,
    color: 'accent3',
    labelKey: 'updateReveal_more_googleMaps',
    platform: 'android',
  },
]

/**
 * A feature chip orbiting the tile in the intro. Positions are in the
 * onboarding welcome's stage units, relative to the hub; the list order is the
 * order they burst out, clockwise from the top left.
 */
export interface RevealChipSpec {
  id: string
  icon: AppIcon
  color: RevealColor
  dx: number
  dy: number
  size: number
  /** 0–1: how far forward it floats — drives parallax and bob. */
  depth: number
  /** Resting tilt, in degrees. */
  tilt: number
}

export const REVEAL_CHIPS: RevealChipSpec[] = [
  {
    id: 'navigation',
    icon: PanelBottomIcon,
    color: 'accent',
    dx: -112,
    dy: -118,
    size: 54,
    depth: 0.9,
    tilt: -6,
  },
  {
    id: 'home',
    icon: HouseIcon,
    color: 'cyan',
    dx: 12,
    dy: -168,
    size: 48,
    depth: 0.6,
    tilt: 4,
  },
  {
    id: 'contacts',
    icon: BookUserIcon,
    color: 'indigo',
    dx: 124,
    dy: -104,
    size: 56,
    depth: 1,
    tilt: 6,
  },
  {
    id: 'year',
    icon: ChartLineIcon,
    color: 'orange',
    dx: 150,
    dy: 22,
    size: 50,
    depth: 0.7,
    tilt: -4,
  },
  {
    id: 'mileage',
    icon: CarIcon,
    color: 'teal',
    dx: 110,
    dy: 138,
    size: 56,
    depth: 0.95,
    tilt: 5,
  },
  {
    id: 'notifications',
    icon: BellIcon,
    color: 'pink',
    dx: -6,
    dy: 172,
    size: 46,
    depth: 0.55,
    tilt: -5,
  },
  {
    id: 'map',
    icon: MapIcon,
    color: 'purple',
    dx: -122,
    dy: 128,
    size: 52,
    depth: 0.85,
    tilt: -3,
  },
  {
    id: 'android',
    icon: SmartphoneIcon,
    color: 'accent2',
    dx: -154,
    dy: 8,
    size: 48,
    depth: 0.65,
    tilt: 4,
  },
]
