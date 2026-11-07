import { Alert } from 'react-native'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { webAccount } from '@/lib/serverAccount'

export function confirmWebSignOut({
  onStarted,
  onFailed,
}: { onStarted?: () => void; onFailed?: () => void } = {}) {
  const account = webAccount
  if (!account) return
  Alert.alert(
    i18n.t('webSignOut_confirmTitle'),
    i18n.t('webSignOut_confirmBody'),
    [
      { text: i18n.t('cancel'), style: 'cancel' },
      {
        text: i18n.t('webSignOut_button'),
        style: 'destructive',
        onPress: () => {
          onStarted?.()
          analytics.capture('web_signed_out')
          void account.signOut().catch(() => onFailed?.())
        },
      },
    ]
  )
}
