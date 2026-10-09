import i18n from '@/lib/locales'
import {
  BuddyInviteError,
  BuddyRemovalPendingError,
} from '@/features/buddies/lib/engine'
import { isRelayError } from '@/features/buddies/lib/relay'
import { MAX_BUDDIES, MAX_OPEN_INVITES } from '@/features/buddies/lib/state'

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
  if (isRelayError(error, 'network')) return i18n.t('buddies_errorOffline')
  if (isRelayError(error, 'timeout')) return i18n.t('buddies_errorTimeout')
  if (isRelayError(error, 'disabled')) return i18n.t('buddies_errorDisabled')
  if (isRelayError(error, 'rate_limited'))
    return i18n.t('buddies_errorRateLimited')
  if (isRelayError(error, 'limit'))
    return i18n.t('buddies_limitReached', { max: MAX_BUDDIES })
  return i18n.t('buddies_errorGeneric')
}

/**
 * Worth offering Try Again for: the connection, a rate limit, or something
 * unexpected. Not for answers that stay the same (an invite that's gone, the
 * kill switch, a full roster).
 */
export function isRetryableBuddiesError(error: unknown): boolean {
  if (error instanceof BuddyInviteError) return false
  if (error instanceof BuddyRemovalPendingError) return false
  return !(
    isRelayError(error, 'disabled') ||
    isRelayError(error, 'not_found') ||
    isRelayError(error, 'gone') ||
    isRelayError(error, 'conflict') ||
    isRelayError(error, 'limit')
  )
}

/** A bounded analytics value for a Buddies failure; never its message. */
export function buddiesFailureReason(
  error: unknown
): 'offline' | 'disabled' | 'rate_limited' | 'error' {
  // A request that got no answer in time is a connection problem too.
  if (isRelayError(error, 'network') || isRelayError(error, 'timeout'))
    return 'offline'
  if (isRelayError(error, 'disabled')) return 'disabled'
  if (isRelayError(error, 'rate_limited')) return 'rate_limited'
  return 'error'
}
