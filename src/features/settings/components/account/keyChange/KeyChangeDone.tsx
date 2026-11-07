import { Platform } from 'react-native'
import { CircleCheckBig as CircleCheckIcon } from 'lucide-react-native'
import HandoffStatus from '@/features/settings/components/account/handoff/HandoffStatus'
import i18n from '@/lib/locales'

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
