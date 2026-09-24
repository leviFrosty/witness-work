import { useState } from 'react'
import { Alert, Share, View } from 'react-native'
import moment from 'moment'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buddiesErrorMessage } from '@/features/buddies/lib/buddiesErrors'
import { MAX_BUDDIES, occupiedBuddySpots } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

function shareInvite(link: string) {
  return Share.share({
    message: i18n.t('buddies_inviteShareMessage', { link }),
  })
}

/** Creates single-use invite links and lists the ones still waiting. */
export default function InviteBuddyCard() {
  const theme = useTheme()
  const [busy, setBusy] = useState(false)
  const outgoingInvites = useBuddies((state) => state.outgoingInvites)
  const buddies = useBuddies((state) => state.buddies)
  const hasName = useBuddies((state) => state.displayName.trim().length > 0)
  const spotsLeft =
    MAX_BUDDIES - occupiedBuddySpots({ buddies, outgoingInvites })

  const invite = async () => {
    setBusy(true)
    try {
      await shareInvite(await buddiesEngine.createInvite())
    } catch (error) {
      Alert.alert(buddiesErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card style={{ gap: 12 }}>
      <ActionButton
        disabled={busy || spotsLeft <= 0 || !hasName}
        onPress={invite}
      >
        {i18n.t('buddies_invite')}
      </ActionButton>
      <Text
        style={{
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('sm'),
          textAlign: 'center',
        }}
      >
        {!hasName
          ? i18n.t('buddies_nameRequired')
          : spotsLeft > 0
            ? i18n.t('buddies_spotsLeft', {
                count: spotsLeft,
                max: MAX_BUDDIES,
              })
            : i18n.t('buddies_limitReached', { max: MAX_BUDDIES })}
      </Text>
      {outgoingInvites.length > 0 && (
        <View style={{ gap: 10 }}>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
              fontFamily: theme.fonts.semiBold,
              textTransform: 'uppercase',
            }}
          >
            {i18n.t('buddies_pendingInvites')}
          </Text>
          {outgoingInvites.map((pending) => (
            <View key={pending.inviteId} style={{ gap: 6 }}>
              <Text style={{ fontSize: theme.fontSize('sm') }}>
                {i18n.t('buddies_inviteExpires', {
                  date: moment(pending.expiresAt).format('LLL'),
                })}
              </Text>
              <XView style={{ gap: 20 }}>
                <Button
                  onPress={() => {
                    const link = buddiesEngine.inviteLinkFor(pending.inviteId)
                    if (link) void shareInvite(link)
                  }}
                >
                  <Text style={{ color: theme.colors.accent }}>
                    {i18n.t('buddies_shareAgain')}
                  </Text>
                </Button>
                <Button
                  onPress={() =>
                    buddiesEngine
                      .cancelInvite(pending.inviteId)
                      .catch((error) => Alert.alert(buddiesErrorMessage(error)))
                  }
                >
                  <Text style={{ color: theme.colors.error }}>
                    {i18n.t('buddies_cancelInvite')}
                  </Text>
                </Button>
              </XView>
            </View>
          ))}
        </View>
      )}
    </Card>
  )
}
