import { AppState } from 'react-native'
import BadgeMedallion from '@/components/badges/BadgeMedallion'
import { analytics } from '@/lib/analytics'
import { parseBadgeKey } from '@/lib/badges/catalog'
import { badgeDescription, badgeTitle } from '@/lib/badges/display'
import i18n from '@/lib/locales'
import { useBadgeSession } from '@/stores/badgeSession'
import { usePreferences } from '@/stores/preferences'
import { toast, toastSettlesUnlock } from '@/stores/toasts'
import type { BadgeKey } from '@/types/badges'

/** The toast and tray key of a badge's news. */
export const badgeNewsKey = (key: BadgeKey | string) => `badge:${key}`

/** Opens a badge's full-screen moment, on the takeover arbiter's next turn. */
export const openBadgeMoment = (key: BadgeKey) =>
  useBadgeSession.getState().celebrate([key])

/**
 * Badges the User's own action just earned (`docs/toasts.md`): one unlock toast
 * each, the most notable in front. Tapping one opens its full-screen moment;
 * swiping it away settles it. One that times out, or whose moment passes behind
 * a takeover, stays new and waits in the notifications tray
 * (`useBadgeNotifications`).
 */
export function showBadgeUnlockToasts(
  keys: readonly BadgeKey[],
  expiresAt?: number
) {
  // The app went away before the toasts could show: the tray has them.
  if (AppState.currentState !== 'active') return
  // Newest in front: the most notable goes last.
  for (const key of [...keys].reverse()) {
    const parsed = parseBadgeKey(key)
    if (!parsed) continue
    toast.unlock({
      key: badgeNewsKey(key),
      eyebrow: i18n.t('badges_newBadge'),
      title: badgeTitle(parsed.art, parsed.level),
      message: badgeDescription(parsed.art, parsed.level),
      art: (size) => (
        <BadgeMedallion art={parsed.art} level={parsed.level} size={size - 8} />
      ),
      expiresAt,
      onShow: () => analytics.capture('unlock_toast_shown', { kind: 'badge' }),
      onOpen: () => openBadgeMoment(key),
      onClose: (reason) => {
        analytics.capture('unlock_toast_closed', {
          kind: 'badge',
          outcome: reason,
        })
        if (toastSettlesUnlock(reason))
          usePreferences.getState().dismissBadgeCard([key])
      },
    })
  }
}
