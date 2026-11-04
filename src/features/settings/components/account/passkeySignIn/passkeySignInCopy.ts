import { platformKey } from '@/app/account/attestationCopy'
import { waitFor } from '@/app/web-sign-in/signInCopy'
import i18n, { type TranslationKey } from '@/lib/locales'
import type { PhonePasskeySignInFailure } from '@/lib/serverAccount/phonePasskeySignIn'

const FAILURES: Record<PhonePasskeySignInFailure, TranslationKey> = {
  not_supported: 'passkeySignIn_failNotSupported',
  domain_not_associated: 'passkeys_failedNotAssociated',
  no_credentials: 'passkeySignIn_failNoCredentials',
  unknown_passkey: 'passkeySignIn_failUnknown',
  passkey_failed: 'passkeySignIn_failPasskey',
  credential: 'passkeySignIn_failMismatch',
  mismatch: 'passkeySignIn_failMismatch',
  timeout: 'passkeys_failedTimeout',
  offline: 'passkeys_failedOffline',
  rate_limited: 'handoff_failRateLimited',
  update_required: 'handoff_failUpdate',
  unavailable: 'handoff_failUnavailable',
  unverified: platformKey(
    'handoff_signInUnverified',
    'handoff_signInUnverifiedAndroid'
  ),
  verify_later: 'handoff_failVerifyLater',
  replace_failed: 'account_replaceFailedBody',
  failed: 'passkeys_failed',
}

/** Why Sign In with a Passkey didn't finish, in one line. */
export function passkeySignInFailureText(
  reason: PhonePasskeySignInFailure,
  {
    retryAfterMs = null,
    removalPending = false,
  }: { retryAfterMs?: number | null; removalPending?: boolean } = {}
): string {
  if (reason === 'rate_limited' && retryAfterMs)
    return i18n.t('webSignIn_problemRateLimited', {
      time: waitFor(retryAfterMs),
    })
  if (reason === 'replace_failed' && removalPending)
    return i18n.t('buddies_deleteAllPending')
  return i18n.t(FAILURES[reason])
}
