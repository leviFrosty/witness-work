import { View } from 'react-native'
import { UserRoundKey as UserRoundKeyIcon } from 'lucide-react-native'
import i18n from '@/lib/locales'
import HandoffStatus, {
  HandoffTextButton,
} from '@/features/settings/components/account/handoff/HandoffStatus'

export default function PasskeySignInChoices({
  onPasskey,
  onOtherPhone,
  onRecoveryKey,
}: {
  onPasskey: () => void
  onOtherPhone: () => void
  onRecoveryKey: () => void
}) {
  return (
    <View style={{ gap: 4, alignItems: 'center' }}>
      <HandoffStatus
        icon={UserRoundKeyIcon}
        title={i18n.t('passkeySignIn_title')}
        body={i18n.t('passkeySignIn_body')}
        primary={{
          label: i18n.t('passkeySignIn_title'),
          onPress: onPasskey,
          testID: 'passkey-sign-in-start',
        }}
        secondary={{
          label: i18n.t('passkeySignIn_otherPhone'),
          onPress: onOtherPhone,
          testID: 'passkey-sign-in-other-phone',
        }}
        testID='passkey-sign-in-choices'
      />
      <HandoffTextButton
        label={i18n.t('handoff_useRecoveryKey')}
        onPress={onRecoveryKey}
        testID='passkey-sign-in-recovery-key'
      />
    </View>
  )
}
