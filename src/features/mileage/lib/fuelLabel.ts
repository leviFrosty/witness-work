import i18n from '@/lib/locales'
import type { Fuel, MileageView } from '@/types/mileage'

export function fuelLabel(
  fuel: Fuel,
  view: Pick<MileageView, 'vehicles' | 'sharedRecordSpaces'>
): string {
  const car = fuelCarName(fuel, view)
  return car ? i18n.t('mileage.fuelOnCar', { fuel: fuel.name, car }) : fuel.name
}

export function fuelCarName(
  fuel: Pick<Fuel, 'id'>,
  view: Pick<MileageView, 'vehicles' | 'sharedRecordSpaces'>
): string | undefined {
  const spaceId = view.sharedRecordSpaces.get(fuel.id)
  return spaceId === undefined
    ? undefined
    : view.vehicles.find((vehicle) => vehicle.spaceId === spaceId)?.name
}
