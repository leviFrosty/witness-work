import i18n, { type TranslationKey } from '@/lib/locales'
import { formatDate } from '@/lib/dates'
import { localizeAppDigits } from '@/lib/numbers'
import type { ApprovalFailure } from '@/lib/serverAccount/approvalSession'
import type { SessionEndReason } from '@/lib/serverAccount/session'
import type {
  WebSignInFailure,
  WebSignInProblem,
} from '@/lib/serverAccount/webSignIn'
import type { WebSignUpProblem } from '@/lib/serverAccount/webSignUp'

type LocaleKey = Parameters<typeof i18n.t>[0]

const PROBLEMS: Record<Exclude<WebSignInFailure, 'cancelled'>, LocaleKey> = {
  notSupported: 'webSignIn_problemNotSupported',
  noPasskey: 'webSignIn_problemNoPasskey',
  passkeyFailed: 'webSignIn_problemPasskeyFailed',
  wrongAccount: 'webSignIn_problemMismatch',
  otherAccount: 'webSignIn_problemMismatch',
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
  signUpPending: 'webSignIn_problemSignUpPending',
  keyHeld: 'webSignIn_problemKeyHeld',
  failed: 'webSignIn_problemFailed',
}

export function waitFor(ms: number): string {
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

export function signInProblemText(
  problem: WebSignInProblem,
  { afterPasskey = false }: { afterPasskey?: boolean } = {}
): string {
  const { failure, retryAfterMs } = problem
  if (failure === 'rateLimited' && retryAfterMs)
    return i18n.t('webSignIn_problemRateLimited', {
      time: waitFor(retryAfterMs),
    })
  if (failure === 'keyRetired' && problem.changedAt)
    return i18n.t('webSignIn_problemKeyRetiredOn', {
      date: formatDate(problem.changedAt),
    })
  if (failure === 'wrongAccount' && afterPasskey)
    return i18n.t('webSignIn_problemWrongAccount')
  if (failure === 'otherAccount') return i18n.t('webSignIn_problemOtherAccount')
  if (failure === 'cancelled') return ''
  return i18n.t(PROBLEMS[failure])
}

const SIGN_UP_PROBLEMS: Record<WebSignUpProblem['failure'], LocaleKey> = {
  notSupported: 'webSignUp_problemNotSupported',
  passkeyFailed: 'webSignUp_problemPasskeyFailed',
  passkeyNotSaved: 'webSignUp_problemPasskeyNotSaved',
  turnstileFailed: 'webSignIn_problemTurnstile',
  rateLimited: 'webSignUp_problemRateLimitedLater',
  paused: 'webSignUp_pausedBody',
  unavailable: 'webSignUp_problemUnavailable',
  offline: 'webSignIn_problemOffline',
  unreachable: 'webSignUp_problemUnreachable',
  updateRequired: 'webSignIn_problemUpdateRequired',
  storage: 'webSignUp_problemStorage',
  otherTab: 'webSignUp_problemOtherTab',
  wrongPasskey: 'webSignUp_problemWrongPasskey',
  pickPasskey: 'webSignUp_problemPickPasskey',
  notCreated: 'webSignUp_problemNotCreated',
  failed: 'webSignIn_problemFailed',
}

export function signUpProblemText({
  failure,
  retryAfterMs,
  passkeyName,
}: WebSignUpProblem): string {
  if (failure === 'pickPasskey' && passkeyName)
    return i18n.t('webSignUp_problemPickPasskeyNamed', { name: passkeyName })
  if (failure === 'rateLimited' && retryAfterMs)
    return i18n.t('webSignUp_problemRateLimited', {
      time: waitFor(retryAfterMs),
    })
  return i18n.t(SIGN_UP_PROBLEMS[failure])
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

export const approvalProblemText = (reason: ApprovalFailure) =>
  i18n.t(APPROVAL[reason] ?? 'webSignIn_problemFailed')

export function endedText(
  reason: SessionEndReason | null,
  changedAt: number | null = null
): string | null {
  switch (reason) {
    case null:
      return null
    case 'key_changed':
      return [
        changedAt
          ? i18n.t('accountKeyChange_elsewhereBody', {
              date: formatDate(changedAt),
            })
          : i18n.t('accountKeyChange_elsewhereBodyNoDate'),
        i18n.t('accountKeyChange_elsewhereHowWeb'),
      ].join(' ')
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
