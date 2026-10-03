import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

import useMileage from '@/stores/mileage'

const reset = () => useMileage.getState()._WARNING_forceDeleteMileage()

describe('mileage store', () => {
  beforeEach(reset)

  it('stamps updatedAt on every save', () => {
    const { saveVehicle } = useMileage.getState()
    saveVehicle({ id: 'car', name: 'Civic', createdAt: 1 })
    const first = useMileage.getState().vehicles[0].updatedAt!
    saveVehicle({ id: 'car', name: 'Civic Si', createdAt: 1 })
    const [car] = useMileage.getState().vehicles
    expect(car.name).toBe('Civic Si')
    expect(car.updatedAt).toBeGreaterThan(first)
    expect(useMileage.getState().vehicles).toHaveLength(1)
  })

  it('deletes a car with its setups and trips, leaving tombstones', () => {
    const state = useMileage.getState()
    state.saveVehicle({ id: 'car', name: 'Civic', createdAt: 1 })
    state.saveVehicle({ id: 'keep', name: 'Truck', createdAt: 1 })
    state.saveVehicleSetup({
      id: 'setup',
      vehicleId: 'car',
      effectiveFrom: '2026-01-01',
      milesPerGallon: 30,
    })
    state.saveTrip({
      id: 'trip',
      vehicleId: 'car',
      date: '2026-03-01',
      distanceMiles: 5,
      createdAt: 1,
    })
    state.saveTrip({
      id: 'other-trip',
      vehicleId: 'keep',
      date: '2026-03-01',
      distanceMiles: 5,
      createdAt: 1,
    })

    useMileage.getState().deleteVehicle('car')

    const after = useMileage.getState()
    expect(after.vehicles.map((v) => v.id)).toEqual(['keep'])
    expect(after.vehicleSetups).toEqual([])
    expect(after.trips.map((t) => t.id)).toEqual(['other-trip'])
    expect(after.deletedMileageRecords.map((t) => t.id).sort()).toEqual([
      'car',
      'setup',
      'trip',
    ])
  })

  it('tombstones everything on delete-all', () => {
    const state = useMileage.getState()
    state.saveFuel({ id: 'gas', name: 'Gasoline', createdAt: 1 })
    state.saveFuelPrice({
      id: 'price',
      fuelId: 'gas',
      effectiveFrom: '2026-01-01',
      pricePerGallon: 3,
    })
    useMileage.getState().deleteAllMileageData()
    const after = useMileage.getState()
    expect(after.fuels).toEqual([])
    expect(after.fuelPrices).toEqual([])
    expect(after.deletedMileageRecords).toHaveLength(2)
  })
})
