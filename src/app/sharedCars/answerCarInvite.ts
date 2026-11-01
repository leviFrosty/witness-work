import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { isSpaceError } from '@/lib/sharedSpaces/client'
import { usePreferences } from '@/stores/preferences'
import { toast } from '@/stores/toasts'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { CarInvitationError } from '@/app/sharedCars/carInvitations'
import { carInvitations } from '@/app/sharedCars/carInvitationsService'
import { SharedCarsError } from '@/app/sharedCars/engine'
import { sharedCarErrorMessage } from '@/app/sharedCars/sharedCarErrors'

const carLabel = (key: string) =>
  useBuddies.getState().carInvites[key]?.name || i18n.t('buddies_aSharedCar')

export function carJoinErrorMessage(error: unknown): string {
  if (
    error instanceof CarInvitationError ||
    (error instanceof SharedCarsError && error.code === 'invalid_invite')
  )
    return i18n.t('buddies_carInviteClosed')
  if (isSpaceError(error))
    switch (error.code) {
      case 'not_found':
      case 'forbidden':
      case 'gone':
      case 'conflict':
      case 'stale_key':
        return i18n.t('buddies_carInviteClosed')
    }
  return sharedCarErrorMessage(error)
}

function trackMileage() {
  if (usePreferences.getState().mileageTrackingEnabled === true) return
  usePreferences.getState().set({ mileageTrackingEnabled: true })
  analytics.capture('mileage_tracking_changed', {
    enabled: true,
    source: 'shared_car_joined',
  })
}

export async function joinCarInvite(key: string): Promise<boolean> {
  if (carInvitations.isAnswering(key)) return false
  const car = carLabel(key)
  const toastKey = `shared-car-join:${key}`
  const joining = carInvitations.join(key)
  toast.info(i18n.t('buddies_carJoining', { car }), { key: toastKey })
  try {
    await joining
  } catch (error) {
    toast.error(i18n.t('buddies_carJoinFailed', { car }), {
      key: toastKey,
      message: carJoinErrorMessage(error),
    })
    return false
  }
  trackMileage()
  toast.success(i18n.t('buddies_carJoinedToast', { car }), { key: toastKey })
  return true
}

export async function declineCarInvite(key: string): Promise<void> {
  await carInvitations.decline(key).catch(() => {})
}
