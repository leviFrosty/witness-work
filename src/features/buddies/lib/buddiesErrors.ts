import i18n from '@/lib/locales'
import {
  BuddyInviteError,
  BuddyRemovalPendingError,
} from '@/features/buddies/lib/engine'
import { isRelayError } from '@/features/buddies/lib/relay'
import { MAX_BUDDIES } from '@/features/buddies/lib/state'

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
      case 'nameRequired':
        return i18n.t('buddies_nameRequired')
    }
  }
  if (error instanceof BuddyRemovalPendingError)
    return error.scope === 'buddy'
      ? i18n.t('buddies_removePending')
      : i18n.t('buddies_deleteAllPending')
  if (isRelayError(error, 'network')) return i18n.t('buddies_errorOffline')
  if (isRelayError(error, 'disabled')) return i18n.t('buddies_errorDisabled')
  if (isRelayError(error, 'rate_limited'))
    return i18n.t('buddies_errorRateLimited')
  if (isRelayError(error, 'limit'))
    return i18n.t('buddies_limitReached', { max: MAX_BUDDIES })
  return i18n.t('buddies_errorGeneric')
}
