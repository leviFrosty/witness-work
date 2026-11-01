import { create } from 'zustand'
import { combine, createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { PersistStorage } from '@/stores/mmkv'
import {
  matchEverything,
  matchFuel,
  matchRecord,
  matchVehicle,
  mergeMileageRecords,
  removeMileageRecords,
  upsertMileageRecord,
  type MileageMatch,
} from '@/lib/mileage/records'
import type {
  Fuel,
  FuelPrice,
  MileageSnapshot,
  MileageTombstone,
  Trip,
  Vehicle,
  VehicleSetup,
} from '@/types/mileage'

const initialState = {
  vehicles: [] as Vehicle[],
  fuels: [] as Fuel[],
  fuelPrices: [] as FuelPrice[],
  vehicleSetups: [] as VehicleSetup[],
  trips: [] as Trip[],

  deletedMileageRecords: [] as MileageTombstone[],
}

const remove = (state: MileageSnapshot, match: MileageMatch) =>
  removeMileageRecords(state, match).changes

export const useMileage = create(
  persist(
    combine(initialState, (set) => ({
      set,
      saveVehicle: (vehicle: Vehicle) =>
        set((state) => upsertMileageRecord(state, 'vehicles', vehicle)),

      deleteVehicle: (id: string) =>
        set((state) => remove(state, matchVehicle(id))),
      saveFuel: (fuel: Fuel) =>
        set((state) => upsertMileageRecord(state, 'fuels', fuel)),

      deleteFuel: (id: string) => set((state) => remove(state, matchFuel(id))),
      saveFuelPrice: (price: FuelPrice) =>
        set((state) => upsertMileageRecord(state, 'fuelPrices', price)),
      deleteFuelPrice: (id: string) =>
        set((state) => remove(state, matchRecord('fuelPrices', id))),
      saveVehicleSetup: (setup: VehicleSetup) =>
        set((state) => upsertMileageRecord(state, 'vehicleSetups', setup)),
      deleteVehicleSetup: (id: string) =>
        set((state) => remove(state, matchRecord('vehicleSetups', id))),
      saveTrip: (trip: Trip) =>
        set((state) => upsertMileageRecord(state, 'trips', trip)),
      deleteTrip: (id: string) =>
        set((state) => remove(state, matchRecord('trips', id))),

      mergeRecords: (records: Partial<MileageSnapshot>) =>
        set((state) => {
          const changes = mergeMileageRecords(state, records)

          return Object.keys(changes).length > 0 ? changes : state
        }),

      deleteAllMileageData: () =>
        set((state) => remove(state, matchEverything)),
      _WARNING_forceDeleteMileage: () => set(initialState),
    })),
    {
      name: 'mileage',
      storage: createJSONStorage(() => PersistStorage),
      version: 0,
      migrate: keepPersistedState,
    }
  )
)

export default useMileage
