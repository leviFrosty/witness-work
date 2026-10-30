import { View } from 'react-native'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import useReconnect from '@/features/buddies/hooks/useReconnect'

/**
 * On a buddy's screen, when they changed their account key and asked to
 * reconnect: Reconnect, or Dismiss, which ends this pairing.
 */
export default function BuddyReconnectCard({ from }: { from: string }) {
  const theme = useTheme()
  const { offer, name, busy, reconnect, dismiss } = useReconnect(from)
  if (!offer) return null
  return (
    <Card>
      <View style={{ gap: 12 }}>
        <Text style={{ fontFamily: theme.fonts.semiBold }}>
          {i18n.t('buddies_notifReconnect', { name })}
        </Text>
        <Text style={{ color: theme.colors.textAlt }}>
          {i18n.t('buddies_reconnectBody', { name })}
        </Text>
        <ActionButton disabled={busy} onPress={reconnect}>
          {i18n.t('buddies_reconnect')}
        </ActionButton>
        <Button
          disabled={busy}
          onPress={dismiss}
          style={{ alignSelf: 'center' }}
        >
          <Text style={{ color: theme.colors.textAlt }}>
            {i18n.t('dismiss')}
          </Text>
        </Button>
      </View>
    </Card>
  )
}
