import { Platform } from 'react-native'
import { CircleCheckBig as CircleCheckIcon } from 'lucide-react-native'
import HandoffStatus from '@/features/settings/components/account/handoff/HandoffStatus'
import i18n from '@/lib/locales'

/**
 * Change Account Key, done. A browser whose passkey gave no PRF output has no
 * passkey that unlocks with the new key (`passkeyUnlocks` false): it offers to
 * add one. Null when nobody asked (phones) or the answer didn't come.
 */
export default function KeyChangeDone({
  passkeyUnlocks,
  onDone,
  onAddPasskey,
}: {
  passkeyUnlocks: boolean | null
  onDone: () => void
  onAddPasskey: () => void
}) {
  return (
    <HandoffStatus
      icon={CircleCheckIcon}
      tone='success'
      title={i18n.t('accountKeyChange_doneTitle')}
      // A browser can't show a sign-in QR code.
      body={i18n.t(
        Platform.select({
          web: 'accountKeyChange_doneBodyWeb',
          default: 'accountKeyChange_doneBody',
        })
      )}
      {...(passkeyUnlocks === false && {
        detail: i18n.t('accountKeyChange_doneAddPasskeyWeb'),
        secondary: {
          label: i18n.t('passkeys_add'),
          onPress: onAddPasskey,
          testID: 'key-change-add-passkey',
        },
      })}
      primary={{
        label: i18n.t('done'),
        onPress: onDone,
        testID: 'key-change-done',
      }}
      testID='key-change-done-status'
    />
  )
}
