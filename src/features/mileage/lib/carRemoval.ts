import type { MileageVehicle } from '@/types/mileage'

export type CarRemoval = {
  archive: boolean

  delete: boolean
}

export const carRemoval = (
  car: Pick<MileageVehicle, 'archived' | 'spaceId'>
): CarRemoval => ({
  archive: !car.archived,
  delete: car.spaceId === undefined,
})
