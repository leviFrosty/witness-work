import { Platform } from 'react-native'
import i18n, { type TranslationKey } from '@/lib/locales'
import {
  BuddyInviteError,
  BuddyRemovalPendingError,
} from '@/features/buddies/lib/engine'
import { isRelayError } from '@/features/buddies/lib/relay'
import { MAX_BUDDIES, MAX_OPEN_INVITES } from '@/features/buddies/lib/state'
import type { BuddySyncFailureReason } from '@/features/buddies/lib/syncStatus'

/** A localized, user-facing sentence for any Buddies failure. */
export function buddiesErrorMessage(error: unknown): string {
  if (error instanceof BuddyInviteError) {
    switch (error.reason) {
      case 'invalid':
        return i18n.t('buddies_inviteInvalid')
      case 'unavailable':
        return i18n.t('buddies_inviteUnavailable')
      case 'own':
        return i18n.t('buddies_inviteOwn')
      case 'alreadyBuddies':
        return i18n.t('buddies_inviteAlreadyBuddies')
      case 'limit':
        return i18n.t('buddies_limitReached', { max: MAX_BUDDIES })
      case 'openInvites':
        return i18n.t('buddies_openInvitesLimit', { max: MAX_OPEN_INVITES })
      case 'nameRequired':
        return i18n.t('buddies_nameRequired')
    }
  }
  if (error instanceof BuddyRemovalPendingError)
    return error.scope === 'buddy'
      ? i18n.t('buddies_removePending')
      : i18n.t('buddies_deleteAllPending')
  if (isRelayError(error, 'unverified'))
    return error.attestation === 'temporary'
      ? i18n.t('buddies_errorVerifyLater')
      : i18n.t(
          Platform.select<TranslationKey>({
            android: 'buddies_errorUnverifiedAndroid',
            web: 'buddies_errorUnverifiedWeb',
            default: 'buddies_errorUnverified',
          })
        )
  if (isRelayError(error, 'upgrade_required'))
    return i18n.t('buddies_errorUpdate')
  if (isRelayError(error, 'network')) return i18n.t('buddies_errorOffline')
  if (isRelayError(error, 'timeout')) return i18n.t('buddies_errorTimeout')
  if (isRelayError(error, 'disabled')) return i18n.t('buddies_errorDisabled')
  if (isRelayError(error, 'suspended')) return i18n.t('buddies_errorSuspended')
  if (isRelayError(error, 'rate_limited'))
    return i18n.t('buddies_errorRateLimited')
  if (isRelayError(error, 'limit'))
    return i18n.t('buddies_limitReached', { max: MAX_BUDDIES })
  return i18n.t('buddies_errorGeneric')
}

/**
 * Worth offering Try Again for: the connection, a rate limit, verifying this
 * device for now, or something unexpected. Not for answers that stay the same
 * (an invite that's gone, the kill switch, a full roster, a device that can't
 * be verified, an app that needs updating).
 */
export function isRetryableBuddiesError(error: unknown): boolean {
  if (error instanceof BuddyInviteError) return false
  if (error instanceof BuddyRemovalPendingError) return false
  if (isRelayError(error, 'unverified'))
    return error.attestation === 'temporary'
  return !(
    isRelayError(error, 'upgrade_required') ||
    isRelayError(error, 'disabled') ||
    isRelayError(error, 'suspended') ||
    isRelayError(error, 'not_found') ||
    isRelayError(error, 'gone') ||
    isRelayError(error, 'conflict') ||
    isRelayError(error, 'limit')
  )
}

/** A bounded analytics value for a Buddies failure; never its message. */
export function buddiesFailureReason(error: unknown): BuddySyncFailureReason {
  // A request that got no answer in time is a connection problem too.
  if (isRelayError(error, 'network') || isRelayError(error, 'timeout'))
    return 'offline'
  // No session: this device couldn't prove it's WitnessWork (ADR 0027).
  if (isRelayError(error, 'unverified'))
    return error.attestation === 'temporary' ? 'verify_later' : 'unverified'
  if (isRelayError(error, 'upgrade_required')) return 'update'
  if (isRelayError(error, 'disabled')) return 'disabled'
  if (isRelayError(error, 'suspended')) return 'suspended'
  if (isRelayError(error, 'rate_limited')) return 'rate_limited'
  return 'error'
}
