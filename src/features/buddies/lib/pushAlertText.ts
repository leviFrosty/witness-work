import moment from 'moment'
import { badgeReactionEmoji } from '@/features/buddies/lib/badgeReactions'
import type { AlertWhen, BuddyAlert } from '@/features/buddies/lib/pushAlerts'
import { badgeTitle } from '@/lib/badges/display'
import { formatStartTime, formatWeekdayMonthDayCompact } from '@/lib/dates'
import i18n from '@/lib/locales'
import type { SharedBadge } from '@/types/badges'

/**
 * The words of a named Buddies alert: who did what in the title, and the day
 * and time or the badge in the body. The iOS extension words the same alerts
 * from the same strings (`BuddiesAlertText.swift`).
 *
 * Never householder data: a Follow-up shows only its day and time, and a Plan
 * none of its free text (title, place, or note), since either can name a
 * householder and both show on the lock screen.
 */

/** "Sat, Oct 10 · 10:00 AM", as shared Plans show it in the app. */
export const alertWhenText = ({ d, s }: AlertWhen) =>
  [
    formatWeekdayMonthDayCompact(moment(d, 'YYYY-MM-DD')),
    s === undefined ? undefined : formatStartTime(s),
  ]
    .filter(Boolean)
    .join(' · ')

const badgeText = (badge: SharedBadge) => badgeTitle(badge.c, badge.l ?? null)

export function buddyAlertText(alert: BuddyAlert): {
  title: string
  body?: string
} {
  const { name } = alert
  switch (alert.type) {
    case 'claimed':
      return {
        title: i18n.t('buddies_alertClaimed', { name }),
        body: i18n.t('buddies_pushInviteClaimedBody'),
      }
    case 'paired':
      return {
        title: i18n.t('buddies_notifPaired', { name }),
        body: i18n.t('buddies_pushPairConfirmedBody'),
      }
    case 'share': {
      const plan = alert.shareType === 'plan'
      const titles = {
        invite: plan
          ? 'buddies_notifPlanInvite'
          : 'buddies_notifFollowUpInvite',
        update: plan
          ? 'buddies_notifPlanUpdate'
          : 'buddies_notifFollowUpUpdate',
        cancel: plan
          ? 'buddies_notifPlanCancel'
          : 'buddies_notifFollowUpCancel',
      } as const
      const title = titles[alert.action]
      return {
        title: i18n.t(title, { name }),
        ...(alert.when ? { body: alertWhenText(alert.when) } : {}),
      }
    }
    case 'reply':
      return {
        title: i18n.t(
          alert.reply === 'going'
            ? 'buddies_notifReplyGoing'
            : 'buddies_notifReplyDeclined',
          { name }
        ),
        ...(alert.when
          ? {
              body: i18n.t(
                alert.shareType === 'followUp'
                  ? 'buddies_alertYourFollowUp'
                  : 'buddies_alertYourPlan',
                { when: alertWhenText(alert.when) }
              ),
            }
          : {}),
      }
    case 'joinRequest':
      return {
        title: i18n.t('buddies_notifJoinRequest', { name }),
        body: i18n.t('buddies_alertYourPlan', {
          when: alertWhenText(alert.when),
        }),
      }
    case 'badge':
      if (alert.badges.length === 0)
        return { title: i18n.t('buddies_notifBadge', { name }) }
      return {
        title: i18n.t(
          alert.badges.length === 1
            ? 'buddies_alertBadgeEarned'
            : 'buddies_alertBadgesEarned',
          { name }
        ),
        body: alert.badges.map(badgeText).join(' · '),
      }
    case 'badgeReaction':
      return {
        title: i18n.t('buddies_alertBadgeReaction', {
          name,
          emoji: badgeReactionEmoji(alert.reaction),
        }),
        body: badgeText(alert.badge),
      }
  }
}
