import { Alert } from 'react-native'
import {
  addPhonePasskey,
  type PasskeyAddSource,
  letPhonePasskeyUnlock,
  removePhonePasskey,
} from '@/app/account/passkeys'
import { stopPasskeyPrompt } from '@/app/account/passkeyPrompt'
import {
  passkeyFailureMessage,
  signInOnlyMessage,
} from '@/features/settings/components/account/passkeys/passkeyCopy'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import type { PasskeySupport } from '@/lib/passkeys'
import type { Passkey } from '@/lib/serverAccount/passkeyClient'
import { isLastUnlocking } from '@/lib/serverAccount/passkeyFlow'
import { toast } from '@/stores/toasts'

/**
 * What Settings → Account → Passkeys tells the User after each action, as
 * toasts (docs/toasts.md). A cancel says nothing. Each resolves once the list
 * is worth reading again.
 */

const unexpected = (title: string) => (error: unknown) => {
  logger.warn('[passkeys] action threw', error)
  toast.error(title, { message: i18n.t('passkeys_failed') })
}

/**
 * Add a Passkey from Settings, onboarding's step or the tray's prompt. Resolves
 * whether a passkey was added. An added passkey ends the gentle prompt for
 * good, wherever the User added it from.
 */
export async function addPasskeyWithToasts(context: {
  count: number
  support: PasskeySupport | null
  source: PasskeyAddSource
}): Promise<boolean> {
  const title = i18n.t('passkeys_addFailed')
  return addPhonePasskey(context)
    .then((result) => {
      if (result.status === 'cancelled') return false
      if (result.status === 'failed') {
        toast.error(title, { message: passkeyFailureMessage(result.reason) })
        return false
      }
      if (result.canUnlock)
        toast.success(i18n.t('passkeys_addedCanUnlock'), {
          message: i18n.t('passkeys_addedCanUnlockMessage'),
        })
      else
        toast.info(i18n.t('passkeys_addedSignInOnly'), {
          message: signInOnlyMessage(result.signInOnly),
        })
      stopPasskeyPrompt()
      return true
    })
    .catch((error: unknown) => {
      unexpected(title)(error)
      return false
    })
}

export async function letUnlockWithToasts(passkey: Passkey): Promise<void> {
  const title = i18n.t('passkeys_unlockFailed')
  await letPhonePasskeyUnlock(passkey.credentialId)
    .then((result) => {
      if (result.status === 'cancelled') return
      if (result.status === 'unlocks') {
        toast.success(i18n.t('passkeys_unlocks'))
        return
      }
      if (result.status === 'failed') {
        toast.error(title, { message: passkeyFailureMessage(result.reason) })
        return
      }
      if (result.signInOnly === 'no_prf')
        toast.info(i18n.t('passkeys_stillSignInOnly'), {
          message: signInOnlyMessage('no_prf'),
        })
      else toast.error(title, { message: i18n.t('passkeys_failed') })
    })
    .catch(unexpected(title))
}

/**
 * The warning first (that it may still sit in the password manager, and when
 * it's the last that can unlock, what that costs), then the owner check and the
 * removal. Resolves false when the User kept it.
 */
export function removeWithConfirm(
  passkey: Passkey,
  passkeys: readonly Passkey[]
): Promise<boolean> {
  const last = isLastUnlocking(passkeys, passkey.credentialId)
  const title = i18n.t('passkeys_removeFailed')
  return new Promise((resolve) =>
    Alert.alert(
      i18n.t('passkeys_removeTitle'),
      i18n.t(last ? 'passkeys_removeLastUnlockingBody' : 'passkeys_removeBody'),
      [
        {
          text: i18n.t('cancel'),
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: i18n.t('remove'),
          style: 'destructive',
          onPress: () =>
            void removePhonePasskey(passkey, last)
              .then((result) => {
                if (result.status === 'removed')
                  toast.success(i18n.t('passkeys_removed'), {
                    message: i18n.t('passkeys_removedMessage'),
                  })
                else if (result.status === 'failed')
                  toast.error(title, {
                    message: passkeyFailureMessage(result.reason),
                  })
                resolve(result.status === 'removed')
              })
              .catch((error: unknown) => {
                unexpected(title)(error)
                resolve(false)
              }),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    )
  )
}
