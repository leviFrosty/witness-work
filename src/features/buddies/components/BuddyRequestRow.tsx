import { useState } from 'react'
import { Alert } from 'react-native'
import { X as XIcon } from 'lucide-react-native'
import moment from 'moment'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import BuddyListRow from '@/features/buddies/components/BuddyListRow'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buddiesErrorMessage } from '@/features/buddies/lib/buddiesErrors'
import type { IncomingClaim } from '@/features/buddies/lib/state'

/** Someone claimed one of my invites; nothing is shared until I confirm. */
export default function BuddyRequestRow({
  claim,
  last,
}: {
  claim: IncomingClaim
  last: boolean
}) {
  const theme = useTheme()
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
    } catch (error) {
      Alert.alert(buddiesErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const decline = () =>
    Alert.alert(
      i18n.t('buddies_requestTitle', { name: claim.name }),
      i18n.t('buddies_requestBody', { name: claim.name }),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('buddies_notWhoIInvited'),
          style: 'destructive',
          onPress: () => run(() => buddiesEngine.rejectClaim(claim.inviteId)),
        },
      ]
    )

  return (
    <BuddyListRow
      last={last}
      leading={<BuddyAvatar avatar={claim.avatar} name={claim.name} />}
      title={claim.name}
      subtitle={i18n.t('buddies_requestRowSubtitle', {
        time: moment(claim.receivedAt).fromNow(),
      })}
      trailing={
        <XView style={{ gap: 6 }}>
          <Button
            disabled={busy}
            onPress={() =>
              run(() => buddiesEngine.confirmClaim(claim.inviteId))
            }
            style={{
              backgroundColor: theme.colors.accent,
              borderRadius: 999,
              paddingHorizontal: 14,
              paddingVertical: 7,
            }}
          >
            <Text
              style={{
                color: theme.colors.textInverse,
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {i18n.t('buddies_confirm')}
            </Text>
          </Button>
          <IconButton
            icon={XIcon}
            onPress={decline}
            accessibilityLabel={i18n.t('buddies_decline')}
            color={theme.colors.textAlt}
          />
        </XView>
      }
    />
  )
}
