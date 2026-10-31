import i18n from '@/lib/locales'
import type { Fuel, MileageView } from '@/types/mileage'

/**
 * A fuel as Mileage Settings lists it. A Shared Car's fuels are its own (its
 * people share their prices), so each is named with its car, "Gasoline · Family
 * Minivan", and never looks like a copy of one of the User's.
 */
export function fuelLabel(
  fuel: Fuel,
  view: Pick<MileageView, 'vehicles' | 'sharedRecordSpaces'>
): string {
  const car = fuelCarName(fuel, view)
  return car ? i18n.t('mileage.fuelOnCar', { fuel: fuel.name, car }) : fuel.name
}

/**
 * The name of the Shared Car `fuel` belongs to, whose people all use its price;
 * undefined for one of the User's own fuels.
 */
export function fuelCarName(
  fuel: Pick<Fuel, 'id'>,
  view: Pick<MileageView, 'vehicles' | 'sharedRecordSpaces'>
): string | undefined {
  const spaceId = view.sharedRecordSpaces.get(fuel.id)
  return spaceId === undefined
    ? undefined
    : view.vehicles.find((vehicle) => vehicle.spaceId === spaceId)?.name
}
