import { activeSharedCarIds } from '@/lib/mileage/sharedCar'
import type { SharedCarsState } from '@/stores/sharedCars'
import type { SharedCarsLeft } from '@/features/mileage/hooks/useMileageSharing'

/**
 * Whether Delete All Mileage Data has a Shared Car to leave: one on this
 * device, one the roster says the User is on that hasn't reached it, a join
 * still being confirmed, or a share still seeding.
 */
export const hasSharedCarsToLeave = (
  state: Pick<SharedCarsState, 'cars' | 'memberships' | 'joining' | 'seeding'>
) =>
  Object.keys(state.cars).length > 0 ||
  activeSharedCarIds(state.memberships).length > 0 ||
  Object.keys(state.joining).length > 0 ||
  Object.keys(state.seeding).length > 0

/**
 * Delete All Mileage Data (docs/mileage-tracking-prd.md, "Shared Cars"): the
 * User's own mileage goes, on every synced device, and they leave each Shared
 * Car, which leaves a copy of it and its trips in their cars. Shared Cars are
 * everyone's on them, so nobody deletes one. Their own data goes first, so the
 * copies made as each car ends are kept. Says which cars the server hasn't
 * heard them leave yet.
 */
export async function deleteAllMileage({
  deleteOwn,
  leaveSharedCars,
  hasSharedCars,
}: {
  deleteOwn: () => void
  /** Leaves every Shared Car, each keeping its copy. */
  leaveSharedCars: () => Promise<SharedCarsLeft>
  hasSharedCars: boolean
}): Promise<SharedCarsLeft> {
  deleteOwn()
  if (!hasSharedCars) return { notLeft: [] }
  return leaveSharedCars()
}
