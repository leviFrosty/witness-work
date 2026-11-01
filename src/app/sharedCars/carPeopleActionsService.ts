import { analytics } from '@/lib/analytics'
import useSharedCars from '@/stores/sharedCars'
import { toast } from '@/stores/toasts'
import { createCarPeopleActions } from '@/app/sharedCars/carPeopleActions'
import { carInvitations } from '@/app/sharedCars/carInvitationsService'
import {
  sharedCarsEngine,
  sharedCarsFailureName,
} from '@/app/sharedCars/sharedCarsService'

export const carPeopleActions = createCarPeopleActions({
  engine: sharedCarsEngine,
  invitations: carInvitations,
  store: useSharedCars,
  toast,
  now: Date.now,
  onEvent: ({ name, ...properties }) => analytics.capture(name, properties),
  failureName: sharedCarsFailureName,
})
