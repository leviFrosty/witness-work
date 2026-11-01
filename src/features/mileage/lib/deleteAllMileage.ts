import { activeSharedCarIds } from '@/lib/mileage/sharedCar'
import type { SharedCarsState } from '@/stores/sharedCars'
import type { SharedCarsLeft } from '@/features/mileage/hooks/useMileageSharing'

export const hasSharedCarsToLeave = (
  state: Pick<SharedCarsState, 'cars' | 'memberships' | 'joining' | 'seeding'>
) =>
  Object.keys(state.cars).length > 0 ||
  activeSharedCarIds(state.memberships).length > 0 ||
  Object.keys(state.joining).length > 0 ||
  Object.keys(state.seeding).length > 0

export async function deleteAllMileage({
  deleteOwn,
  leaveSharedCars,
  hasSharedCars,
}: {
  deleteOwn: () => void

  leaveSharedCars: () => Promise<SharedCarsLeft>
  hasSharedCars: boolean
}): Promise<SharedCarsLeft> {
  deleteOwn()
  if (!hasSharedCars) return { notLeft: [] }
  return leaveSharedCars()
}
