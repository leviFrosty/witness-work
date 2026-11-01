import i18n from '@/lib/locales'
import { isSpaceError } from '@/lib/sharedSpaces/client'
import { CarInvitationError } from '@/app/sharedCars/carInvitations'
import { SharedCarsError } from '@/app/sharedCars/engine'

export function sharedCarErrorMessage(
  error: unknown,
  { name = '' }: { name?: string } = {}
): string {
  if (error instanceof CarInvitationError)
    switch (error.code) {
      case 'already_on_car':
        return i18n.t('mileage.sharedCarError_alreadyOnCar', { name })
      case 'already_invited':
        return i18n.t('mileage.sharedCarError_alreadyInvited', { name })
      case 'not_buddy':
        return i18n.t('mileage.sharedCarError_notBuddy', { name })
      case 'not_found':
        return i18n.t('mileage.sharedCarError_gone')
    }
  if (error instanceof SharedCarsError)
    switch (error.code) {
      case 'no_account_key':
        return i18n.t('mileage.sharedCarError_noAccount')
      case 'not_owner':
        return i18n.t('mileage.sharedCarError_notOwner')
      case 'not_ready':
        return i18n.t('mileage.sharedCarError_notReady')

      case 'key_unverified':
        return i18n.t('mileage.sharedCarError_waiting')
      case 'not_found':
      case 'invalid_invite':
        return i18n.t('mileage.sharedCarError_gone')
    }
  if (isSpaceError(error))
    switch (error.code) {
      case 'limit':
        return i18n.t('buddies_carFull')
      case 'too_large':
        return i18n.t('mileage.sharedCarError_tooLarge')
      case 'suspended':
        return i18n.t('buddies_carSuspended')
      case 'disabled':
        return i18n.t('mileage.sharedCarError_unavailable')
      case 'gone':
      case 'not_found':
        return i18n.t('mileage.sharedCarError_gone')
      case 'forbidden':
        return i18n.t('mileage.sharedCarError_notOwner')
      case 'stale_key':
        return i18n.t('mileage.sharedCarError_notReady')
      case 'network':
      case 'timeout':
        return i18n.t('buddies_errorOffline')
      case 'rate_limited':
        return i18n.t('buddies_errorRateLimited')
      case 'upgrade_required':
        return i18n.t('mileage.sharedCarsUpdateRequired')
    }
  return i18n.t('buddies_errorGeneric')
}
