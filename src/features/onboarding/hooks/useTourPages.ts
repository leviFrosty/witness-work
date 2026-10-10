import { Platform } from 'react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import useDevice from '@/hooks/useDevice'
import { siriPhrase } from '@/features/updates/lib/siriPhrase'
import {
  RevealMoreTile,
  RevealPage,
  meetsIos,
  onThisPlatform,
} from '@/features/updates/hooks/useRevealPages'
import {
  TOUR_MORE_ITEMS,
  TOUR_PAGES,
} from '@/features/onboarding/constants/tourPages'
import { calendarBridgeAvailable } from '../../../../modules/calendar-bridge'
import * as WatchBridge from '../../../../modules/watch-bridge'

/**
 * The onboarding tour as this device should see it: platform-only pages and
 * tiles dropped, Buddies (and mentions of it) only where it shows, Calendar
 * where the build can sync it, and the Apple Watch pages on any iPhone that can
 * pair one.
 */
const useTourPages = (buddies: boolean): RevealPage[] => {
  const theme = useTheme()
  const { isTablet } = useDevice()
  const watchSupported = WatchBridge.getStatus().isSupported

  const tiles: RevealMoreTile[] = TOUR_MORE_ITEMS.filter(
    (item) =>
      onThisPlatform(item.platform) &&
      (!item.tabletOnly || isTablet) &&
      meetsIos(item.minIos)
  ).map((item) => ({
    id: item.id,
    icon: item.icon,
    color: theme.colors[item.color],
    label: i18n.t(item.labelKey),
  }))

  return TOUR_PAGES.filter(
    (page) =>
      onThisPlatform(page.platform) &&
      (!page.buddiesOnly || buddies) &&
      (!page.watchOnly || watchSupported) &&
      (!page.calendarOnly || calendarBridgeAvailable)
  ).map((page) => {
    const captionKey =
      Platform.OS === 'android' && page.androidCaptionKey
        ? page.androidCaptionKey
        : !buddies && page.noBuddiesCaptionKey
          ? page.noBuddiesCaptionKey
          : page.captionKey
    return {
      id: page.id,
      icon: page.icon,
      color: theme.colors[page.color],
      title: i18n.t(page.titleKey),
      caption: i18n.t(captionKey),
      callout: page.siriPhraseKey
        ? i18n.t('updateReveal_siri_quote', {
            phrase: siriPhrase(page.siriPhraseKey),
          })
        : undefined,
      Visual: page.Visual,
      tiles: page.id === 'more' ? tiles : undefined,
    }
  })
}

export default useTourPages
