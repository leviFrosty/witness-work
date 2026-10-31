import type { MileageVehicle } from '@/types/mileage'

/** How the car form can take a car out of use. */
export type CarRemoval = {
  /** Archive: hidden from new trips, its trips kept in reports. */
  archive: boolean
  /** Delete the car and its trips. */
  delete: boolean
}

/**
 * What the car form offers for `car`: archiving while it isn't archived, and
 * deleting only one of the User's own cars. A Shared Car's trips are everyone's
 * on it, so nobody deletes it; its owner stops sharing instead, which leaves
 * each person a copy (docs/mileage-tracking-prd.md, "Shared Cars").
 */
export const carRemoval = (
  car: Pick<MileageVehicle, 'archived' | 'spaceId'>
): CarRemoval => ({
  archive: !car.archived,
  delete: car.spaceId === undefined,
})
