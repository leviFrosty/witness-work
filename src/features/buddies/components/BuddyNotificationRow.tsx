import { useState } from 'react'
import { Alert, View } from 'react-native'
import { X as XIcon } from 'lucide-react-native'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import ContextMenu from '@/components/ui/ContextMenu'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import { formatRelative } from '@/lib/dates'
import i18n from '@/lib/locales'
import { useServiceReport } from '@/stores/serviceReport'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import SharedEventSummary from '@/features/buddies/components/SharedEventSummary'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buddiesErrorMessage } from '@/features/buddies/lib/buddiesErrors'
import { effectiveShareStatus } from '@/features/buddies/lib/linkedPlans'
import type { ShareReply } from '@/features/buddies/lib/schemas'
import type { BuddyNotification } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

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
  }
}

/**
 * One queue entry in the notifications tray; invitations and claims can be
 * answered in place. Long-press the entry to open or dismiss it; the answer
 * buttons stay outside the long-press target. A request still waiting on an
 * answer can't be dismissed: answering is what clears it.
 */
export default function BuddyNotificationRow({
  entry,
  unread,
  onPress,
  onDismiss,
  onAction,
}: {
  entry: BuddyNotification
  unread: boolean
  /** Opens what the entry is about, when there's somewhere to go. */
  onPress?: () => void
  /** Absent while the entry awaits an answer. */
  onDismiss?: () => void
  /** Records a tap on one of the row's actions (bounded name). */
  onAction: (action: string) => void
}) {
  const theme = useTheme()
  const [busy, setBusy] = useState(false)
  const [changing, setChanging] = useState(false)
  const share = useBuddies((state) =>
    entry.kind !== 'shareReply' && entry.shareKey
      ? state.incomingShares[entry.shareKey]
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
  const reply = (answer: ShareReply) => {
    onAction(answer)
    return run(() => buddiesEngine.replyToShare(entry.shareKey!, answer))
  }
  const open = onPress
    ? () => {
        onAction('open')
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
            onAction('reject')
            return run(() => buddiesEngine.rejectClaim(inviteId))
          },
        },
      ]
    )

  const canAnswer =
    !!share && status !== 'cancelled' && (status === 'pending' || changing)

  const title = headline({ ...entry, name: buddy?.name ?? entry.name })

  return (
    <View style={{ gap: 10, paddingVertical: 12, paddingHorizontal: 14 }}>
      <XView style={{ gap: 10, alignItems: 'flex-start' }}>
        <ContextMenu
          style={{ flex: 1 }}
          analyticsSurface='buddy_notification'
          onPress={open}
          accessibilityLabel={title}
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
          ]}
        >
          <View style={{ gap: 10 }}>
            <XView style={{ gap: 10, alignItems: 'center' }}>
              <View>
                <BuddyAvatar
                  avatar={buddy?.avatar ?? claim?.avatar}
                  name={buddy?.name ?? entry.name}
                  colorIndex={buddy?.colorIndex}
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
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('sm'),
                  }}
                >
                  {formatRelative(entry.at)}
                </Text>
              </View>
            </XView>

            {entry.shareKey && entry.kind !== 'shareReply' ? (
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
        <XView style={{ gap: 10 }}>
          <View style={{ flex: 1 }}>
            <ActionButton disabled={busy} onPress={() => reply('going')}>
              {i18n.t('buddies_going')}
            </ActionButton>
          </View>
          <Button
            disabled={busy}
            style={{ paddingVertical: 10, paddingHorizontal: 12 }}
            onPress={() => reply('declined')}
          >
            <Text style={{ color: theme.colors.textAlt }}>
              {i18n.t('buddies_cantMakeIt')}
            </Text>
          </Button>
        </XView>
      ) : share && (status === 'going' || status === 'declined') ? (
        <XView style={{ gap: 10, justifyContent: 'space-between' }}>
          <Text style={{ color: theme.colors.textAlt }}>
            {i18n.t(
              status === 'going'
                ? 'buddies_answeredGoing'
                : 'buddies_answeredDeclined'
            )}
          </Text>
          <Button
            onPress={() => {
              onAction('change_answer')
              setChanging(true)
            }}
          >
            <Text style={{ color: theme.colors.accent }}>
              {i18n.t('buddies_changeAnswer')}
            </Text>
          </Button>
        </XView>
      ) : null}

      {entry.kind === 'claim' && claim ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: theme.colors.textAlt }}>
            {i18n.t('buddies_requestBody', { name: entry.name })}
          </Text>
          <ActionButton
            disabled={busy}
            onPress={() => {
              onAction('confirm')
              void run(() => buddiesEngine.confirmClaim(claim.inviteId))
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
