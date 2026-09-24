import { useState } from 'react'
import { Alert, Pressable, View } from 'react-native'
import { X as XIcon } from 'lucide-react-native'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import { formatRelative } from '@/lib/dates'
import i18n from '@/lib/locales'
import { useServiceReport } from '@/stores/serviceReport'
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
      return i18n.t('buddies_notifClaim', name)
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

/** One queue entry; invitations and claims can be answered in place. */
export default function BuddyNotificationRow({
  entry,
  onPress,
}: {
  entry: BuddyNotification
  /** Opens what the entry is about, when there's somewhere to go. */
  onPress?: () => void
}) {
  const theme = useTheme()
  const [busy, setBusy] = useState(false)
  const [changing, setChanging] = useState(false)
  const share = useBuddies((state) =>
    entry.kind !== 'shareReply' && entry.shareKey
      ? state.incomingShares[entry.shareKey]
      : undefined
  )
  const claimOpen = useBuddies((state) =>
    state.incomingClaims.some((claim) => claim.inviteId === entry.inviteId)
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
  const reply = (answer: ShareReply) =>
    run(() => buddiesEngine.replyToShare(entry.shareKey!, answer))

  const canAnswer =
    !!share && status !== 'cancelled' && (status === 'pending' || changing)

  return (
    <Pressable disabled={!onPress} onPress={onPress}>
      <Card style={{ gap: 10 }}>
        <XView style={{ gap: 10, alignItems: 'flex-start' }}>
          {!entry.read && (
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                marginTop: 7,
                backgroundColor: theme.colors.accent,
              }}
            />
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: theme.fonts.semiBold }}>
              {headline(entry)}
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
          <IconButton
            icon={XIcon}
            size={16}
            hitSlop={12}
            accessibilityLabel={i18n.t('dismiss')}
            onPress={() => buddiesEngine.dismissNotification(entry.id)}
          />
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
            <Button onPress={() => setChanging(true)}>
              <Text style={{ color: theme.colors.accent }}>
                {i18n.t('buddies_changeAnswer')}
              </Text>
            </Button>
          </XView>
        ) : null}

        {entry.kind === 'claim' && claimOpen && entry.inviteId ? (
          <View style={{ gap: 6 }}>
            <Text style={{ color: theme.colors.textAlt }}>
              {i18n.t('buddies_requestBody', { name: entry.name })}
            </Text>
            <ActionButton
              disabled={busy}
              onPress={() =>
                run(() => buddiesEngine.confirmClaim(entry.inviteId!))
              }
            >
              {i18n.t('buddies_confirm')}
            </ActionButton>
            <Button
              disabled={busy}
              style={{ alignSelf: 'center', paddingVertical: 6 }}
              onPress={() =>
                run(() => buddiesEngine.rejectClaim(entry.inviteId!))
              }
            >
              <Text style={{ color: theme.colors.error }}>
                {i18n.t('buddies_notWhoIInvited')}
              </Text>
            </Button>
          </View>
        ) : null}
      </Card>
    </Pressable>
  )
}
