import { isSpaceError } from '@/lib/sharedSpaces/client'
import type { TranslationKey } from '@/lib/locales'
import { TerritorySharingError } from '@/app/territories/engine/types'
import { TerritoryInvitationError } from '@/app/territories/territoryInvitations'

export type SharingFailure =
  | 'offline'
  | 'needsBuddies'
  | 'notAllowed'
  | 'paused'
  | 'tooLarge'
  | 'nothingToShare'
  | 'failed'

export function sharingFailure(error: unknown): SharingFailure {
  if (error instanceof TerritorySharingError)
    switch (error.code) {
      case 'no_account_key':
        return 'needsBuddies'
      case 'not_owner':
      case 'not_allowed':
        return 'notAllowed'
      case 'nothing_to_share':
        return 'nothingToShare'
      default:
        return 'failed'
    }
  if (error instanceof TerritoryInvitationError) return 'failed'
  if (isSpaceError(error))
    switch (error.code) {
      case 'network':
      case 'timeout':
      case 'unauthorized':
      case 'rate_limited':
        return 'offline'
      case 'disabled':
      case 'suspended':
        return 'paused'
      case 'forbidden':
        return 'notAllowed'
      case 'too_large':
      case 'limit':
        return 'tooLarge'
      default:
        return 'failed'
    }
  return 'failed'
}

export const SHARING_FAILURE_TEXT: Record<SharingFailure, TranslationKey> = {
  offline: 'territories.share.offline_toast',
  needsBuddies: 'territories.share.needsBuddies_toast',
  notAllowed: 'territories.share.notAllowed_toast',
  paused: 'territories.share.paused_toast',
  tooLarge: 'territories.share.tooLarge_toast',
  nothingToShare: 'territories.share.nothingToShare_toast',
  failed: 'territories.share.failed_toast',
}

const OUTDATED = new Set<string>(['bad_request', 'upgrade_required'])

export function startFailureText(error: unknown): TranslationKey {
  const failure = sharingFailure(error)
  if (failure === 'offline') return 'territories.share.startOffline_toast'
  if (failure !== 'failed') return SHARING_FAILURE_TEXT[failure]
  return isSpaceError(error) && OUTDATED.has(error.code)
    ? 'territories.share.startOutdated_toast'
    : 'territories.share.startFailed_toast'
}
