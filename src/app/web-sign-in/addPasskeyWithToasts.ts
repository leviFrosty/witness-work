import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { toast } from '@/stores/toasts'
import {
  passkeyFailureMessage,
  signInOnlyMessage,
} from '@/features/settings/components/account/passkeys/passkeyCopy'
import { addPasskeyHere } from '@/app/web-sign-in/webSignInRuntime'

/**
 * Add a Passkey after "Approved by …", saying how it went as Settings →
 * Passkeys does. Resolves true once a passkey was added; a cancel says
 * nothing.
 */
export async function addPasskeyWithToasts(): Promise<boolean> {
  const title = i18n.t('passkeys_addFailed')
  try {
    const result = await addPasskeyHere()
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
    return true
  } catch (error) {
    logger.warn('[web sign-in] adding a passkey threw', error)
    toast.error(title, { message: i18n.t('passkeys_failed') })
    return false
  }
}
