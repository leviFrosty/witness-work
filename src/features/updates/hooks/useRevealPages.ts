import type { ComponentType } from 'react'
import { Platform } from 'react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import usePublisher from '@/hooks/usePublisher'
import useDevice from '@/hooks/useDevice'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { siriPhrase } from '@/features/updates/lib/siriPhrase'
import * as WatchBridge from '../../../../modules/watch-bridge'
import type { AppIcon } from '@/components/ui/LucideIcon'
import type { RevealVisualProps } from '@/features/updates/components/reveal/visuals/kit'
import { REVEAL_VISUALS } from '@/features/updates/components/reveal/visuals/registry'
import {
  REVEAL_CHIPS,
  REVEAL_MORE_ITEMS,
  REVEAL_PAGES,
  RevealChipSpec,
} from '@/features/updates/constants/updateRevealPages'

/** One page of a tour (the update's, or onboarding's). */
export interface RevealPage {
  /** Stable; also the page's analytics value. */
  id: string
  icon: AppIcon
  color: string
  title: string
  caption: string
  /** A Siri phrase to call out beneath the caption, quoted. */
  callout?: string
  /** The page's illustration. */
  Visual?: ComponentType<RevealVisualProps>
  /** A grid of small feature tiles, drawn in place of `Visual`. */
  tiles?: RevealMoreTile[]
}

export type RevealChip = Omit<RevealChipSpec, 'color'> & { color: string }

export interface RevealMoreTile {
  id: string
  icon: AppIcon
  color: string
  label: string
}

/** Whether something limited to `platform` shows on this device. */
export const onThisPlatform = (platform?: 'ios' | 'android') =>
  !platform || platform === Platform.OS

/** Whether this device runs at least iOS `minIos`, when one is required. */
export const meetsIos = (minIos?: number) =>
  !minIos ||
  (Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= minIos)

/**
 * The tour as this device and role should see it: platform-only pages and tiles
 * dropped, Android copy where it differs, the Year Pace page only for roles
 * that have the card, Buddies (and mentions of it) only where it shows, and the
 * Apple Watch pages only on an iPhone. Whether a watch is paired isn't known
 * until the connection activates, after the reveal has started, so every iPhone
 * sees them.
 */
const useRevealPages = () => {
  const theme = useTheme()
  const { hasAnnualGoal, showsTimeEntry } = usePublisher()
  const { isTablet } = useDevice()
  const buddiesEnabled = useBuddiesEnabled()
  const watchSupported = WatchBridge.getStatus().isSupported

  const moreTiles: RevealMoreTile[] = REVEAL_MORE_ITEMS.filter(
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

  const pages: RevealPage[] = REVEAL_PAGES.filter(
    (page) =>
      onThisPlatform(page.platform) &&
      (!page.annualGoalOnly || hasAnnualGoal) &&
      (!page.buddiesOnly || buddiesEnabled) &&
      (!page.watchOnly || watchSupported) &&
      (!page.timeEntryOnly || showsTimeEntry)
  ).map((page) => {
    const copy = Platform.OS === 'android' && page.android ? page.android : page
    const captionKey =
      !showsTimeEntry && page.checkboxCaptionKey
        ? page.checkboxCaptionKey
        : !buddiesEnabled && page.noBuddiesCaptionKey
          ? page.noBuddiesCaptionKey
          : copy.captionKey
    return {
      id: page.id,
      icon: page.icon,
      color: theme.colors[page.color],
      title: i18n.t(copy.titleKey),
      caption: i18n.t(captionKey),
      callout: page.siriPhraseKey
        ? i18n.t('updateReveal_siri_quote', {
            phrase: siriPhrase(page.siriPhraseKey),
          })
        : undefined,
      ...(page.id === 'more'
        ? { tiles: moreTiles }
        : { Visual: REVEAL_VISUALS[page.id] }),
    }
  })

  const chips: RevealChip[] = REVEAL_CHIPS.map((chip) => ({
    ...chip,
    color: theme.colors[chip.color],
  }))

  return { pages, chips }
}

export default useRevealPages
