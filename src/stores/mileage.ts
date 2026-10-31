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
  /**
   * Tombstones for every deleted mileage record, so iCloud sync propagates
   * deletions. Ids are UUIDs, so one list covers all collections.
   */
  deletedMileageRecords: [] as MileageTombstone[],
}

/** Removes the matching records and tombstones them. */
const remove = (state: MileageSnapshot, match: MileageMatch) =>
  removeMileageRecords(state, match).changes

/**
 * Persisted store for Mileage Tracking: the User's own cars, fuels, their
 * effective-dated price/setup histories, and trips. Sync-aware like
 * `categories`: every mutation stamps `updatedAt`, and deletions leave
 * tombstones (`@/lib/mileage/records`).
 *
 * Only sync, backups, and dev tools use it directly. Everything else reads
 * through `@/stores/mileageView` and writes through `@/stores/mileageWrites`,
 * which add the User's Shared Cars.
 */
export const useMileage = create(
  persist(
    combine(initialState, (set) => ({
      set,
      saveVehicle: (vehicle: Vehicle) =>
        set((state) => upsertMileageRecord(state, 'vehicles', vehicle)),
      /** Deletes the car with its fuel setups and trips. */
      deleteVehicle: (id: string) =>
        set((state) => remove(state, matchVehicle(id))),
      saveFuel: (fuel: Fuel) =>
        set((state) => upsertMileageRecord(state, 'fuels', fuel)),
      /**
       * Deletes the fuel and its prices. Car setups keep the dangling id and
       * simply stop producing an estimated cost.
       */
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
      /**
       * Adds records and tombstones exactly as given, stamps included, by the
       * per-record merge rule (`mergeMileageRecords`): a Shared Car's personal
       * copy, which every device of the User makes with the same ids and
       * stamps, and the deletions of records a Shared Car took over.
       */
      mergeRecords: (records: Partial<MileageSnapshot>) =>
        set((state) => {
          const changes = mergeMileageRecords(state, records)
          // Nothing newer: no write, so subscribers (and sync) aren't woken.
          return Object.keys(changes).length > 0 ? changes : state
        }),
      /** Tombstones every mileage record, on every synced device. */
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
