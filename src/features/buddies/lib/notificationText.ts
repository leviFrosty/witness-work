import { badgeTitle } from '@/lib/badges/display'
import i18n, { type TranslationKey } from '@/lib/locales'
import { badgeReactionEmoji } from '@/features/buddies/lib/badgeReactions'
import type { BuddyNotification } from '@/features/buddies/lib/state'

/** A queue entry's line in the bell, naming the buddy as `entry.name`. */
export function notificationHeadline(entry: BuddyNotification): string {
  const name = { name: entry.name }
  const followUp = entry.shareType === 'followUp'
  switch (entry.kind) {
    case 'claim':
      return i18n.t('buddies_requestTitle', name)
    case 'paired':
      return i18n.t('buddies_notifPaired', name)
    case 'shareInvite':
      return followUp
        ? i18n.t('buddies_notifFollowUpInvite', name)
        : i18n.t('buddies_notifPlanInvite', name)
    case 'shareUpdate':
      return followUp
        ? i18n.t('buddies_notifFollowUpUpdate', name)
        : i18n.t('buddies_notifPlanUpdate', name)
    case 'shareCancel':
      return followUp
        ? i18n.t('buddies_notifFollowUpCancel', name)
        : i18n.t('buddies_notifPlanCancel', name)
    case 'shareReply':
      return entry.reply === 'going'
        ? i18n.t('buddies_notifReplyGoing', name)
        : i18n.t('buddies_notifReplyDeclined', name)
    case 'joinRequest':
      return i18n.t('buddies_notifJoinRequest', name)
    case 'badge': {
      // "Tomás has 2 new badges": those that came together or within a day.
      const count = entry.badges?.length ?? 0
      return count > 1
        ? i18n.t('buddies_notifBadges' as TranslationKey, { ...name, count })
        : i18n.t('buddies_notifBadge', name)
    }
    case 'badgeReaction': {
      // "Alex reacted 🎉 to Year Round, Gold"
      const [badge] = entry.badges ?? []
      return i18n.t('buddies_notifBadgeReaction', {
        ...name,
        emoji: entry.reaction ? badgeReactionEmoji(entry.reaction) : '',
        badge: badge ? badgeTitle(badge.c, badge.l ?? null) : '',
      })
    }
  }
}

/**
 * "Year Round, Gold + 1 more": a buddy's new badges, the one named first
 * leading.
 */
export function badgeNewsLine(entry: BuddyNotification): string | undefined {
  const [top, ...rest] = entry.badges ?? []
  if (entry.kind !== 'badge' || !top) return undefined
  const badge = badgeTitle(top.c, top.l ?? null)
  if (rest.length === 0) return badge
  return i18n.t('buddies_notifBadgeMore' as TranslationKey, {
    badge,
    count: rest.length,
  })
}
