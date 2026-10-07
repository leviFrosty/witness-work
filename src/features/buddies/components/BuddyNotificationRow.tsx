import { useState } from 'react'
import { Alert, View } from 'react-native'
import { Check as CheckIcon, X as XIcon } from 'lucide-react-native'
import BadgeMedallion from '@/components/badges/BadgeMedallion'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import ContextMenu from '@/components/ui/ContextMenu'
import IconButton from '@/components/ui/IconButton'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import moment from 'moment'
import { analytics } from '@/lib/analytics'
import { badgeTitle } from '@/lib/badges/display'
import Haptics from '@/lib/haptics'
import { formatRelative, formatStartTime } from '@/lib/dates'
import i18n, { type TranslationKey } from '@/lib/locales'
import { getStartTimeInMinutes, storedDayKey } from '@/lib/normalizeDate'
import { useServiceReport } from '@/stores/serviceReport'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import SharedEventSummary from '@/features/buddies/components/SharedEventSummary'
import ShareAnswerButtons from '@/features/buddies/components/ShareAnswerButtons'
import useReplyDelivery from '@/features/buddies/hooks/useReplyDelivery'
import { badgeReactionEmoji } from '@/features/buddies/lib/badgeReactions'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buddiesErrorMessage } from '@/features/buddies/lib/buddiesErrors'
import { overlappingOwnPlans } from '@/features/buddies/lib/joinRequests'
import { effectiveShareStatus } from '@/features/buddies/lib/linkedPlans'
import type { ShareReply } from '@/features/buddies/lib/schemas'
import { trackShareAnswer } from '@/features/buddies/lib/shareAnswerAnalytics'
import {
  replyHoldMs,
  type BuddyNotification,
} from '@/features/buddies/lib/state'
import type { DayPlan } from '@/types/timeEntry'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { noteUserAction } from '@/lib/userAction'

function headline(entry: BuddyNotification): string {
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
    case 'badge':
      return i18n.t('buddies_notifBadge', name)
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
 * "Year Round, Gold + 1 more": the badge named first, and how many came with
 * it.
 */
function badgeLine(entry: BuddyNotification): string | undefined {
  const [top, ...rest] = entry.badges ?? []
  if (entry.kind !== 'badge' || !top) return undefined
  const badge = badgeTitle(top.c, top.l ?? null)
  if (rest.length === 0) return badge
  return i18n.t('buddies_notifBadgeMore' as TranslationKey, {
    badge,
    count: rest.length,
  })
}

/**
 * One queue entry in the notifications tray; invitations, claims, and requests
 * to join can be answered in place. Long-press the entry to open or dismiss it;
 * the answer buttons stay outside the long-press target. An invitation or claim
 * still waiting on an answer can't be dismissed: answering is what clears it. A
 * request to join can: Not Now is dismissing it, and Invite turns into a check
 * once the buddy is invited. A buddy's new badge shows its medallion and opens
 * their page; a buddy's reaction to one of this User's badges shows that
 * badge's medallion and opens it.
 */
export default function BuddyNotificationRow({
  entry,
  unread,
  onPress,
  onDismiss,
  onInvite,
  ownPlan,
  invited,
  cantInvite,
}: {
  entry: BuddyNotification
  unread: boolean
  /** Opens what the entry is about, when there's somewhere to go. */
  onPress?: () => void
  /** Absent while the entry awaits an answer. */
  onDismiss?: () => void
  /** A request to join: adds the buddy to the Plan, which invites them. */
  onInvite?: () => void
  /** A request to join: this User's Plan it's about, for its title and place. */
  ownPlan?: Pick<DayPlan, 'title' | 'location'>
  /** A request to join: this User already invited them to a Plan that day. */
  invited?: boolean
  /**
   * A request to join with no Invite: the Plan follows someone else's
   * invitation (their name, if still a buddy), or this User's Plans that day
   * changed and none match.
   */
  cantInvite?: { reason: 'linked'; organizer?: string } | { reason: 'changed' }
}) {
  const theme = useTheme()
  const [busy, setBusy] = useState(false)
  const [changing, setChanging] = useState(false)
  const isJoinRequest = entry.kind === 'joinRequest'
  const share = useBuddies((state) =>
    entry.kind !== 'shareReply' && !isJoinRequest && entry.shareKey
      ? state.incomingShares[entry.shareKey]
      : undefined
  )
  const joinRequest = useBuddies((state) =>
    isJoinRequest && entry.shareKey
      ? state.joinRequests[entry.shareKey]
      : undefined
  )
  const claim = useBuddies((state) =>
    entry.inviteId
      ? state.incomingClaims.find((c) => c.inviteId === entry.inviteId)
      : undefined
  )
  const buddy = useBuddies((state) =>
    entry.from ? state.buddies.find((b) => b.inboxId === entry.from) : undefined
  )
  const dayPlans = useServiceReport((state) => state.dayPlans)
  const status = share ? effectiveShareStatus(share, dayPlans) : undefined
  const replyDelivery = useReplyDelivery(share ? entry.shareKey : undefined)

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
      setChanging(false)
    } catch (error) {
      Alert.alert(buddiesErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  /**
   * "Going" adds the buddy's Plan to this User's; one of their own at the same
   * time would then be counted twice, so offer to replace it.
   */
  const offerReplace = () => {
    if (!share || share.type !== 'plan') return
    const overlapping = overlappingOwnPlans(share.details, dayPlans)
    if (overlapping.length === 0) return
    const [first] = overlapping
    const date = moment(storedDayKey(first.date), 'YYYY-MM-DD').format(
      'ddd, MMM D'
    )
    const resolve = (choice: 'replace' | 'keep_both') => {
      analytics.capture('buddy_invite_overlap_resolved', { choice })
      if (choice !== 'replace') return
      const { deleteDayPlan } = useServiceReport.getState()
      for (const plan of overlapping) deleteDayPlan(plan.id)
    }
    Alert.alert(
      i18n.t('buddies_replacePlanTitle'),
      overlapping.length === 1
        ? i18n.t('buddies_replacePlanBody', {
            time: formatStartTime(getStartTimeInMinutes(first)),
            date,
            name: buddy ? buddyDisplayName(buddy) : entry.name,
          })
        : i18n.t('buddies_replacePlansBody', {
            count: overlapping.length,
            date,
            name: buddy ? buddyDisplayName(buddy) : entry.name,
          }),
      [
        {
          text: i18n.t('buddies_keepBoth'),
          style: 'cancel',
          onPress: () => resolve('keep_both'),
        },
        {
          text: i18n.t('buddies_replacePlan'),
          style: 'destructive',
          onPress: () => resolve('replace'),
        },
      ]
    )
  }
  const askerName = buddy ? buddyDisplayName(buddy) : entry.name
  // Nothing to turn off when this buddy's requests already can't alert.
  const mutedJoinRequests = useBuddies((state) =>
    state.notificationsEnabled && state.joinRequestNotifications && entry.from
      ? state.mutedJoinRequests.includes(entry.from)
      : true
  )
  const reply = (answer: ShareReply) => {
    trackShareAnswer('notifications', entry.shareType, answer)
    return run(async () => {
      await buddiesEngine.replyToShare(entry.shareKey!, answer, {
        holdMs: replyHoldMs(answer),
      })
      if (answer === 'going') offerReplace()
    })
  }
  const invite = () => {
    analytics.capture('buddy_join_request_answered', { action: 'invited' })
    void Haptics.success()
    onInvite?.()
  }
  // Muting from where the request is decided; the switch is on their page.
  const muteJoinRequests = () => {
    const from = entry.from
    if (!from) return
    analytics.capture('buddy_join_request_notifications_changed', {
      scope: 'buddy',
      enabled: false,
    })
    useBuddies.setState((state) => ({
      mutedJoinRequests: [...state.mutedJoinRequests, from],
    }))
  }
  const open = onPress
    ? () => {
        onPress()
      }
    : undefined
  const rejectClaim = (inviteId: string) =>
    Alert.alert(
      i18n.t('buddies_requestTitle', { name: entry.name }),
      i18n.t('buddies_requestBody', { name: entry.name }),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('buddies_notWhoIInvited'),
          style: 'destructive',
          onPress: () => {
            return run(() => buddiesEngine.rejectClaim(inviteId))
          },
        },
      ]
    )

  const canAnswer =
    !!share && status !== 'cancelled' && (status === 'pending' || changing)

  const title = headline({
    ...entry,
    name: buddy ? buddyDisplayName(buddy) : entry.name,
  })
  const newBadges = badgeLine(entry)
  const topBadge =
    newBadges || entry.kind === 'badgeReaction' ? entry.badges?.[0] : undefined

  return (
    <View style={{ gap: 10, paddingVertical: 12, paddingHorizontal: 14 }}>
      <XView style={{ gap: 10, alignItems: 'flex-start' }}>
        <ContextMenu
          style={{ flex: 1 }}
          onPress={open}
          accessibilityLabel={newBadges ? `${title}, ${newBadges}` : title}
          hoverRadius={theme.numbers.borderRadiusSm}
          actions={[
            open && {
              id: 'open',
              title: i18n.t('open'),
              systemImage: 'arrow.up.forward.app',
              onPress: open,
            },
            onDismiss && {
              id: 'dismiss',
              title: i18n.t('dismiss'),
              systemImage: 'xmark',
              onPress: onDismiss,
            },
            joinRequest &&
              !mutedJoinRequests && {
                id: 'mute_join_requests',
                title: i18n.t('buddies_turnOffAskToJoinAlerts', {
                  name: askerName,
                }),
                systemImage: 'bell.slash',
                onPress: muteJoinRequests,
              },
          ]}
        >
          <View style={{ gap: 10 }}>
            <XView style={{ gap: 10, alignItems: 'center' }}>
              <View>
                <BuddyAvatar
                  avatar={buddy?.avatar ?? claim?.avatar}
                  name={buddy ? buddyDisplayName(buddy) : entry.name}
                  color={buddy}
                  size={36}
                />
                {unread && (
                  <View
                    accessibilityElementsHidden
                    style={{
                      position: 'absolute',
                      top: -2,
                      left: -2,
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      borderWidth: 1.5,
                      borderColor: theme.colors.card,
                      backgroundColor: theme.colors.accent,
                    }}
                  />
                )}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: theme.fonts.semiBold }}>
                  {title}
                </Text>
                {newBadges ? <Text>{newBadges}</Text> : null}
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('sm'),
                  }}
                >
                  {formatRelative(entry.at)}
                </Text>
              </View>
              {topBadge ? (
                <View
                  accessibilityElementsHidden
                  importantForAccessibility='no-hide-descendants'
                >
                  <BadgeMedallion
                    art={topBadge.c}
                    level={topBadge.l ?? null}
                    size={28}
                  />
                </View>
              ) : null}
            </XView>

            {joinRequest ? (
              <SharedEventSummary
                details={{
                  d: joinRequest.d,
                  s: joinRequest.s,
                  m: joinRequest.m,
                  title: ownPlan?.title,
                  location: ownPlan?.location,
                }}
                isFollowUp={false}
              />
            ) : entry.shareKey && entry.kind !== 'shareReply' ? (
              share ? (
                <View style={{ opacity: status === 'cancelled' ? 0.5 : 1 }}>
                  <SharedEventSummary
                    details={share.details}
                    isFollowUp={share.type === 'followUp'}
                  />
                </View>
              ) : (
                <Text style={{ color: theme.colors.textAlt }}>
                  {i18n.t('buddies_noLongerAvailable')}
                </Text>
              )
            ) : null}
          </View>
        </ContextMenu>
        {onDismiss ? (
          <IconButton
            icon={XIcon}
            size={16}
            hitSlop={12}
            style={{ paddingTop: 10 }}
            accessibilityLabel={i18n.t('dismiss')}
            onPress={onDismiss}
          />
        ) : null}
      </XView>

      {canAnswer ? (
        <ShareAnswerButtons disabled={busy} onAnswer={reply} />
      ) : share && (status === 'going' || status === 'declined') ? (
        <XView style={{ gap: 10, justifyContent: 'space-between' }}>
          <Text
            numberOfLines={1}
            style={{ flexShrink: 1, color: theme.colors.textAlt }}
          >
            {i18n.t(
              status === 'going'
                ? 'buddies_answeredGoing'
                : 'buddies_answeredDeclined'
            )}
            {replyDelivery ? ` · ${replyDelivery}` : null}
          </Text>
          <Button
            onPress={() => {
              setChanging(true)
            }}
          >
            <Text style={{ color: theme.colors.accent }}>
              {i18n.t('buddies_changeAnswer')}
            </Text>
          </Button>
        </XView>
      ) : null}

      {joinRequest ? (
        <View style={{ gap: 10 }}>
          {cantInvite && !invited ? (
            <Text style={{ color: theme.colors.textAlt }}>
              {cantInvite.reason === 'changed'
                ? i18n.t('buddies_joinRequestChanged', { name: askerName })
                : cantInvite.organizer
                  ? i18n.t('buddies_joinRequestLinked', {
                      organizer: cantInvite.organizer,
                      name: askerName,
                    })
                  : i18n.t('buddies_joinRequestLinkedUnknown', {
                      name: askerName,
                    })}
            </Text>
          ) : null}
          <XView style={{ gap: 10 }}>
            {invited ? (
              <View
                accessible
                accessibilityLabel={i18n.t('buddies_joinRequestInvited', {
                  name: askerName,
                })}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: 12,
                  borderRadius: theme.numbers.borderRadiusSm,
                  backgroundColor: theme.colors.accentTranslucent,
                }}
              >
                <LucideIcon
                  icon={CheckIcon}
                  size={20}
                  strokeWidth={2.75}
                  color={theme.colors.accent}
                />
              </View>
            ) : onInvite ? (
              <View style={{ flex: 1 }}>
                <ActionButton onPress={invite}>
                  {i18n.t('buddies_joinRequestInvite')}
                </ActionButton>
              </View>
            ) : null}
            {onDismiss && !invited ? (
              <Button
                style={{ paddingVertical: 10, paddingHorizontal: 12 }}
                onPress={onDismiss}
              >
                <Text style={{ color: theme.colors.textAlt }}>
                  {i18n.t('buddies_joinRequestNotNow')}
                </Text>
              </Button>
            ) : null}
          </XView>
        </View>
      ) : null}

      {entry.kind === 'claim' && claim ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: theme.colors.textAlt }}>
            {i18n.t('buddies_requestBody', { name: entry.name })}
          </Text>
          <ActionButton
            disabled={busy}
            onPress={() => {
              void run(async () => {
                await buddiesEngine.confirmClaim(claim.inviteId)
                noteUserAction('buddy')
              })
            }}
          >
            {i18n.t('buddies_confirm')}
          </ActionButton>
          <Button
            disabled={busy}
            style={{ alignSelf: 'center', paddingVertical: 6 }}
            onPress={() => rejectClaim(claim.inviteId)}
          >
            <Text style={{ color: theme.colors.error }}>
              {i18n.t('buddies_notWhoIInvited')}
            </Text>
          </Button>
        </View>
      ) : null}
    </View>
  )
}
