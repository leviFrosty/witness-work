import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import {
  RevealMoreTile,
  RevealPage,
  canPairWatch,
  onThisPlatform,
} from '@/features/updates/hooks/useRevealPages'
import {
  TOUR_PAGES,
  tourMoreItems,
} from '@/features/onboarding/constants/tourPages'
import { calendarBridgeAvailable } from '../../../../modules/calendar-bridge'
import { hasCapability } from '@/lib/platformCapabilities'

const useTourPages = (buddies: boolean): RevealPage[] => {
  const theme = useTheme()

  const tiles: RevealMoreTile[] = tourMoreItems(
    {
      buddies,
      watch: canPairWatch(),
      calendar: hasCapability('calendarBridge') && calendarBridgeAvailable,
    },
    onThisPlatform
  ).map((item) => ({
    id: item.id,
    icon: item.icon,
    color: theme.colors[item.color],
    label: i18n.t(item.labelKey),
  }))

  return TOUR_PAGES.map((page) => ({
    id: page.id,
    icon: page.icon,
    color: theme.colors[page.color],
    title: i18n.t(page.titleKey),
    caption: i18n.t(page.captionKey),
    Visual: page.Visual,
    tiles: page.id === 'more' ? tiles : undefined,
  }))
}

export default useTourPages
