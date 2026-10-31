import i18n, { type TranslationKey } from '@/lib/locales'
import { localizeAppDigits } from '@/lib/numbers'
import type { ApprovalFailure } from '@/lib/serverAccount/approvalSession'
import type { SessionEndReason } from '@/lib/serverAccount/session'
import type {
  WebSignInFailure,
  WebSignInProblem,
} from '@/lib/serverAccount/webSignIn'

type LocaleKey = Parameters<typeof i18n.t>[0]

const PROBLEMS: Record<Exclude<WebSignInFailure, 'cancelled'>, LocaleKey> = {
  notSupported: 'webSignIn_problemNotSupported',
  noPasskey: 'webSignIn_problemNoPasskey',
  passkeyFailed: 'webSignIn_problemPasskeyFailed',
  wrongAccount: 'webSignIn_problemMismatch',
  unknownAccount: 'webSignIn_problemUnknownAccount',
  keyRetired: 'webSignIn_problemKeyRetired',
  turnstileFailed: 'webSignIn_problemTurnstile',
  checkNeeded: 'webSignIn_problemCheckNeeded',
  rateLimited: 'webSignIn_problemRateLimitedLater',
  expired: 'webSignIn_problemExpired',
  offline: 'webSignIn_problemOffline',
  unavailable: 'webSignIn_problemUnavailable',
  updateRequired: 'webSignIn_problemUpdateRequired',
  storage: 'webSignIn_problemStorage',
  failed: 'webSignIn_problemFailed',
}

/** "10 minutes", "2 hours": how long until a rate limit lets up. */
function waitFor(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000))
  if (minutes < 60)
    return localizeAppDigits(
      i18n.t('webSignIn_waitMinutes' as TranslationKey, { count: minutes })
    )
  return localizeAppDigits(
    i18n.t('webSignIn_waitHours' as TranslationKey, {
      count: Math.ceil(minutes / 60),
    })
  )
}

/**
 * One line for a sign-in that didn't finish. `afterPasskey` when the key came
 * to finish a passkey's sign-in, so a mismatch names the passkey.
 */
export function signInProblemText(
  problem: WebSignInProblem,
  { afterPasskey = false }: { afterPasskey?: boolean } = {}
): string {
  const { failure, retryAfterMs } = problem
  if (failure === 'rateLimited' && retryAfterMs)
    return i18n.t('webSignIn_problemRateLimited', {
      time: waitFor(retryAfterMs),
    })
  if (failure === 'wrongAccount' && afterPasskey)
    return i18n.t('webSignIn_problemWrongAccount')
  if (failure === 'cancelled') return ''
  return i18n.t(PROBLEMS[failure])
}

const APPROVAL: Partial<Record<ApprovalFailure, LocaleKey>> = {
  expired: 'webSignIn_phoneExpired',
  cancelled: 'webSignIn_phoneDeclined',
  used: 'webSignIn_phoneUsed',
  conflict: 'webSignIn_phoneUsed',
  offline: 'webSignIn_problemOffline',
  unavailable: 'webSignIn_phoneUnavailable',
  tampered: 'webSignIn_problemMismatch',
  badToken: 'webSignIn_problemMismatch',
  rateLimited: 'webSignIn_problemRateLimitedLater',
  updateRequired: 'webSignIn_problemUpdateRequired',
}

/** Why the phone's code stopped working. */
export const approvalProblemText = (reason: ApprovalFailure) =>
  i18n.t(APPROVAL[reason] ?? 'webSignIn_problemFailed')

/** Why the server signed this browser out, in one line; null for none. */
export function endedText(reason: SessionEndReason | null): string | null {
  switch (reason) {
    case null:
      return null
    case 'replaced':
      return i18n.t('webSignIn_endedReplaced')
    case 'revoked':
      return i18n.t('webSignIn_endedRevoked')
    case 'reused':
      return i18n.t('webSignIn_endedReused')
    default:
      return i18n.t('webSignIn_endedExpired')
  }
}
