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

export const badgeNewsKey = (key: BadgeKey | string) => `badge:${key}`

export const openBadgeMoment = (key: BadgeKey) =>
  useBadgeSession.getState().celebrate([key])

export function showBadgeUnlockToasts(
  keys: readonly BadgeKey[],
  expiresAt?: number
) {
  if (AppState.currentState !== 'active') return

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
