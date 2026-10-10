import type { ComponentType } from 'react'
import type { RevealPageId } from '@/features/updates/constants/updateRevealPages'
import type { RevealVisualProps } from '@/features/updates/components/reveal/visuals/kit'
import NavigationVisual from '@/features/updates/components/reveal/visuals/NavigationVisual'
import MapVisual from '@/features/updates/components/reveal/visuals/MapVisual'
import BuddiesVisual from '@/features/updates/components/reveal/visuals/BuddiesVisual'
import BadgesVisual from '@/features/updates/components/reveal/visuals/BadgesVisual'
import NotificationsVisual from '@/features/updates/components/reveal/visuals/NotificationsVisual'
import HomeVisual from '@/features/updates/components/reveal/visuals/HomeVisual'
import ContactsVisual from '@/features/updates/components/reveal/visuals/ContactsVisual'
import YearPaceVisual from '@/features/updates/components/reveal/visuals/YearPaceVisual'
import MileageVisual from '@/features/updates/components/reveal/visuals/MileageVisual'
import CalendarVisual from '@/features/updates/components/reveal/visuals/CalendarVisual'
import WatchVisual from '@/features/updates/components/reveal/visuals/WatchVisual'
import SiriVisual from '@/features/updates/components/reveal/visuals/SiriVisual'
import AndroidShareVisual from '@/features/updates/components/reveal/visuals/AndroidShareVisual'

/**
 * The illustration for each page of the update's tour. "And so much more" draws
 * its page's tiles instead (see `RevealPage.tiles`).
 */
export const REVEAL_VISUALS: Record<
  Exclude<RevealPageId, 'more'>,
  ComponentType<RevealVisualProps>
> = {
  navigation: NavigationVisual,
  map: MapVisual,
  buddies: BuddiesVisual,
  badges: BadgesVisual,
  notifications: NotificationsVisual,
  home: HomeVisual,
  contacts: ContactsVisual,
  year: YearPaceVisual,
  mileage: MileageVisual,
  calendar: CalendarVisual,
  watch: WatchVisual,
  siri: SiriVisual,
  android: AndroidShareVisual,
}
