import { Award as AwardIcon } from 'lucide-react-native'
import { useShallow } from 'zustand/react/shallow'
import {
  badgeNewsKey,
  openBadgeMoment,
} from '@/features/badges/lib/badgeToasts'
import { analytics } from '@/lib/analytics'
import { parseBadgeKey } from '@/lib/badges/catalog'
import {
  badgeDescription,
  badgeTitle,
  homeCardBadges,
} from '@/lib/badges/display'
import i18n from '@/lib/locales'
import { useBadgeSession } from '@/stores/badgeSession'
import { usePreferences } from '@/stores/preferences'
import { toastKeys, useToasts } from '@/stores/toasts'
import type { NotificationItem } from '@/types/notifications'

const KEY_PREFIX = badgeNewsKey('')

/**
 * The User's new badges nobody has settled yet, one tray item each: earned
 * while the app wasn't in front (iCloud Sync, the Watch, Siri, overnight), or a
 * unlock toast that left without being opened or swiped away. View opens the
 * full-screen moment. Leaves out a badge whose toast is on screen or whose
 * moment is waiting its turn, and lets a badge go once the profile or the
 * Badges screen has shown it, or after a month. Nothing with Show badges off.
 */
export default function useBadgeNotifications(now: number): NotificationItem[] {
  const earned = usePreferences((s) => s.earnedBadges)
  const seenAt = usePreferences((s) => s.badgesSeenAt)
  const dismissed = usePreferences((s) => s.badgeCardDismissed)
  const showBadges = usePreferences((s) => s.showBadges)
  const celebrating = useBadgeSession((s) => s.celebrations)
  const onScreen = useToasts(
    useShallow((s) =>
      toastKeys(s.toasts)
        .filter((key) => key.startsWith(KEY_PREFIX))
        .map((key) => key.slice(KEY_PREFIX.length))
    )
  )
  if (!showBadges) return []

  const keys = homeCardBadges({
    earned,
    seenAt,
    dismissed,
    waiting: [...celebrating, ...onScreen],
    now,
  })
  return keys.flatMap((key): NotificationItem[] => {
    const parsed = parseBadgeKey(key)
    if (!parsed) return []
    const settle = () => usePreferences.getState().dismissBadgeCard([key])
    return [
      {
        id: badgeNewsKey(key),
        kind: 'badge',
        at: earned[key]?.at,
        icon: AwardIcon,
        tone: 'accent',
        title: i18n.t('badges_trayTitle', {
          badge: badgeTitle(parsed.art, parsed.level),
        }),
        description: badgeDescription(parsed.art, parsed.level),
        actions: [
          {
            id: 'view',
            label: i18n.t('view'),
            onPress: () => {
              analytics.capture('unlock_opened_from_tray', { kind: 'badge' })
              openBadgeMoment(key)
            },
          },
        ],
        onDismiss: settle,
      },
    ]
  })
}
