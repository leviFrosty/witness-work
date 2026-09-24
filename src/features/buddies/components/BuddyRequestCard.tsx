import { useState } from 'react'
import { Alert, View } from 'react-native'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buddiesErrorMessage } from '@/features/buddies/lib/buddiesErrors'
import type { IncomingClaim } from '@/features/buddies/lib/state'

/** Someone claimed one of my invites; nothing is shared until I confirm. */
export default function BuddyRequestCard({ claim }: { claim: IncomingClaim }) {
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

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ gap: 4 }}>
        <Text style={{ fontFamily: theme.fonts.semiBold }}>
          {i18n.t('buddies_requestTitle', { name: claim.name })}
        </Text>
        <Text style={{ color: theme.colors.textAlt }}>
          {i18n.t('buddies_requestBody', { name: claim.name })}
        </Text>
      </View>
      <ActionButton
        disabled={busy}
        onPress={() => run(() => buddiesEngine.confirmClaim(claim.inviteId))}
      >
        {i18n.t('buddies_confirm')}
      </ActionButton>
      <Button
        disabled={busy}
        style={{ alignSelf: 'center', paddingVertical: 6 }}
        onPress={() => run(() => buddiesEngine.rejectClaim(claim.inviteId))}
      >
        <Text style={{ color: theme.colors.error }}>
          {i18n.t('buddies_notWhoIInvited')}
        </Text>
      </Button>
    </Card>
  )
}
