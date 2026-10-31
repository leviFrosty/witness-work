import { analytics } from '@/lib/analytics'
import useSharedCars from '@/stores/sharedCars'
import { toast } from '@/stores/toasts'
import { createCarPeopleActions } from '@/app/sharedCars/carPeopleActions'
import { carInvitations } from '@/app/sharedCars/carInvitationsService'
import {
  sharedCarsEngine,
  sharedCarsFailureName,
} from '@/app/sharedCars/sharedCarsService'

/** The car form's People actions, on the app's engine and invitations. */
export const carPeopleActions = createCarPeopleActions({
  engine: sharedCarsEngine,
  invitations: carInvitations,
  store: useSharedCars,
  toast,
  now: Date.now,
  onEvent: ({ name, ...properties }) => analytics.capture(name, properties),
  failureName: sharedCarsFailureName,
})
