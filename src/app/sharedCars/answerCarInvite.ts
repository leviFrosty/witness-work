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

/** The car an invitation names, for a toast: its name, or "a shared car". */
const carLabel = (key: string) =>
  useBuddies.getState().carInvites[key]?.name || i18n.t('buddies_aSharedCar')

/**
 * Why joining failed, in the User's words: an invitation that's no longer open
 * (answered, canceled, used, lapsed, made for a key the car no longer has, or a
 * car that's gone), else what sharing a car says of the same failure (offline,
 * full, suspended, out of date, …).
 */
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

/**
 * Joining a car is choosing to track its mileage: Mileage turns on, so the car
 * is in the User's Mileage on Home and in Settings right away.
 */
function trackMileage() {
  if (usePreferences.getState().mileageTrackingEnabled === true) return
  usePreferences.getState().set({ mileageTrackingEnabled: true })
  analytics.capture('mileage_tracking_changed', {
    enabled: true,
    source: 'shared_car_joined',
  })
}

/**
 * Join, from a buddy's invitation in the bell: says it's joining, then that it
 * joined or why it couldn't (the invitation stays to answer again). Whether it
 * joined. A second tap while the first is on its way does nothing.
 */
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

/**
 * Decline: the buddy hears now, or on a later sync, so it can't fail here
 * except for an invitation that's no longer open (answered or canceled, or a
 * car the User is on, which the bell shows as joined) or one already being
 * answered.
 */
export async function declineCarInvite(key: string): Promise<void> {
  await carInvitations.decline(key).catch(() => {
    // Nothing left to decline.
  })
}
