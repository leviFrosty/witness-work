import { View } from 'react-native'
import { UserRoundKey as UserRoundKeyIcon } from 'lucide-react-native'
import i18n from '@/lib/locales'
import HandoffStatus, {
  HandoffTextButton,
} from '@/features/settings/components/account/handoff/HandoffStatus'

export default function PasskeySignInCantUnlock({
  prf,
  onOtherPhone,
  onRecoveryKey,
  onTryAgain,
}: {
  prf: boolean
  onOtherPhone: () => void
  onRecoveryKey: () => void
  onTryAgain: () => void
}) {
  return (
    <View style={{ gap: 4, alignItems: 'center' }}>
      <HandoffStatus
        icon={UserRoundKeyIcon}
        title={i18n.t('passkeySignIn_cantUnlockTitle')}
        body={i18n.t('passkeySignIn_cantUnlock')}
        detail={i18n.t(
          prf
            ? 'passkeySignIn_cantUnlockSaves'
            : 'passkeySignIn_cantUnlockNoPrf'
        )}
        primary={{
          label: i18n.t('passkeySignIn_otherPhone'),
          onPress: onOtherPhone,
          testID: 'passkey-cant-unlock-other-phone',
        }}
        secondary={{
          label: i18n.t('handoff_useRecoveryKey'),
          onPress: onRecoveryKey,
          testID: 'passkey-cant-unlock-recovery-key',
        }}
        testID='passkey-cant-unlock'
      />
      <HandoffTextButton
        label={i18n.t('passkeySignIn_tryAnother')}
        onPress={onTryAgain}
        testID='passkey-cant-unlock-try-another'
      />
    </View>
  )
}
