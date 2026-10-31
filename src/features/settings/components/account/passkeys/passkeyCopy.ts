import type {
  PasskeyFlowFailure,
  SignInOnlyReason,
} from '@/lib/serverAccount/passkeyFlow'
import i18n from '@/lib/locales'
import { PASSKEYS_MAX } from '@/lib/serverAccount/passkeyFlow'

/** One plain sentence for why adding, unlocking or removing failed. */
export function passkeyFailureMessage(reason: PasskeyFlowFailure): string {
  switch (reason) {
    case 'owner_failed':
      return i18n.t('passkeys_failedOwner')
    case 'not_supported':
      return i18n.t('passkeys_failedNotSupported')
    case 'domain_not_associated':
      return i18n.t('passkeys_failedNotAssociated')
    case 'already_registered':
      return i18n.t('passkeys_failedAlreadyRegistered')
    case 'no_credentials':
      return i18n.t('passkeys_failedNoCredentials')
    case 'limit':
      return i18n.t('passkeys_failedLimit', { max: PASSKEYS_MAX })
    case 'offline':
      return i18n.t('passkeys_failedOffline')
    case 'timeout':
      return i18n.t('passkeys_failedTimeout')
    case 'update_required':
      return i18n.t('passkeys_failedUpdate')
    case 'unverified':
      return i18n.t('passkeys_failedUnverified')
    case 'rate_limited':
      return i18n.t('passkeys_failedRateLimited')
    case 'conflict':
      return i18n.t('passkeys_failedConflict')
    case 'unavailable':
    case 'failed':
      return i18n.t('passkeys_failed')
  }
}

/** Why a passkey can only sign in, in one line. */
export function signInOnlyMessage(reason: SignInOnlyReason): string {
  switch (reason) {
    case 'no_prf':
      return i18n.t('passkeys_whyNoPrf')
    case 'cancelled':
      return i18n.t('passkeys_whyCancelled')
    case 'key_changed':
    case 'not_saved':
      return i18n.t('passkeys_whyNotSaved')
  }
}
