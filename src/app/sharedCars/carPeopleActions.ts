import i18n from '@/lib/locales'
import { MAX_SHARED_CAR_PEOPLE, takenCarPlaces } from '@/lib/mileage/sharedCar'
import type { SharedCarsStore } from '@/stores/sharedCars'
import type { toast as appToast } from '@/stores/toasts'
import type { CarInvitations } from '@/app/sharedCars/carInvitations'
import type { SharedCarsEngine } from '@/app/sharedCars/engine'
import { sharedCarErrorMessage } from '@/app/sharedCars/sharedCarErrors'

export type CarPeopleEvent =
  | { name: 'shared_car_share_started' }
  | { name: 'shared_car_share_failed'; reason: string }
  | { name: 'shared_car_member_removed' }

export type CarPeopleActionsDeps = {
  engine: Pick<
    SharedCarsEngine,
    'shareCar' | 'leaveCar' | 'stopSharing' | 'removeMember'
  >
  invitations: Pick<CarInvitations, 'inviteBuddy' | 'cancelInvite'>
  store: Pick<SharedCarsStore, 'getState'>
  toast: Pick<typeof appToast, 'info' | 'success' | 'error'>
  now: () => number

  onEvent?: (event: CarPeopleEvent) => void

  failureName: (error: unknown) => string
}

const carLabel = (name: string) => name || i18n.t('buddies_aSharedCar')

export function createCarPeopleActions(deps: CarPeopleActionsDeps) {
  const { engine, invitations, toast } = deps

  async function shareCar(vehicle: {
    id: string
    name: string
  }): Promise<string | null> {
    deps.onEvent?.({ name: 'shared_car_share_started' })
    try {
      const { spaceId } = await engine.shareCar(vehicle.id)
      return spaceId
    } catch (error) {
      deps.onEvent?.({
        name: 'shared_car_share_failed',
        reason: deps.failureName(error),
      })
      toast.error(
        i18n.t('mileage.shareFailed', { car: carLabel(vehicle.name) }),
        { message: sharedCarErrorMessage(error) }
      )
      return null
    }
  }

  async function invite(
    spaceId: string,
    buddy: { inboxId: string; name: string }
  ): Promise<boolean> {
    const key = `shared-car-invite:${spaceId}:${buddy.inboxId}`
    const failed = (message: string) => {
      toast.error(i18n.t('mileage.inviteFailed', { name: buddy.name }), {
        key,
        message,
      })
      return false
    }
    const car = deps.store.getState().cars[spaceId]
    if (!car) return failed(i18n.t('mileage.sharedCarError_gone'))
    if (takenCarPlaces(car, deps.now()) >= MAX_SHARED_CAR_PEOPLE)
      return failed(i18n.t('buddies_carFull'))
    toast.info(i18n.t('mileage.inviting', { name: buddy.name }), { key })
    try {
      await invitations.inviteBuddy(spaceId, buddy.inboxId)
    } catch (error) {
      return failed(sharedCarErrorMessage(error, { name: buddy.name }))
    }
    toast.success(i18n.t('mileage.invited', { name: buddy.name }), {
      key,
      message: i18n.t('mileage.invited_message'),
    })
    return true
  }

  async function cancelInvite(
    spaceId: string,
    inviteId: string
  ): Promise<boolean> {
    try {
      await invitations.cancelInvite(spaceId, inviteId)
    } catch (error) {
      toast.error(i18n.t('mileage.cancelInviteFailed'), {
        message: sharedCarErrorMessage(error),
      })
      return false
    }
    toast.success(i18n.t('mileage.inviteCanceled'))
    return true
  }

  async function leave(spaceId: string, carName: string): Promise<boolean> {
    const car = carLabel(carName)
    try {
      await engine.leaveCar(spaceId)
    } catch (error) {
      toast.error(i18n.t('mileage.leaveFailed', { car }), {
        message: sharedCarErrorMessage(error),
      })
      return false
    }
    toast.success(i18n.t('mileage.leftCar', { car }), {
      message: i18n.t('mileage.copyKept'),
    })
    return true
  }

  async function stopSharing(
    spaceId: string,
    carName: string
  ): Promise<boolean> {
    const car = carLabel(carName)
    try {
      await engine.stopSharing(spaceId)
    } catch (error) {
      toast.error(i18n.t('mileage.stopSharingFailed', { car }), {
        message: sharedCarErrorMessage(error),
      })
      return false
    }
    toast.success(i18n.t('mileage.stoppedSharing', { car }), {
      message: i18n.t('mileage.stoppedSharing_message'),
    })
    return true
  }

  async function remove(
    spaceId: string,
    person: { memberId: string; name: string }
  ): Promise<boolean> {
    try {
      await engine.removeMember(spaceId, person.memberId)
    } catch (error) {
      toast.error(i18n.t('mileage.removeFailed', { name: person.name }), {
        message: sharedCarErrorMessage(error, { name: person.name }),
      })
      return false
    }
    deps.onEvent?.({ name: 'shared_car_member_removed' })
    toast.success(i18n.t('mileage.removedPerson', { name: person.name }))
    return true
  }

  return { shareCar, invite, cancelInvite, leave, stopSharing, remove }
}

export type CarPeopleActions = ReturnType<typeof createCarPeopleActions>
