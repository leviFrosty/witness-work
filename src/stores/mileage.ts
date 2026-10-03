import { syncTimestamp } from '@/lib/syncClock'
import { create } from 'zustand'
import { persist, combine, createJSONStorage } from 'zustand/middleware'
import { PersistStorage } from '@/stores/mmkv'
import type {
  Fuel,
  FuelPrice,
  MileageCollections,
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

type Collection = keyof MileageCollections
type State = typeof initialState
type WithId = { id: string; updatedAt?: number }

/** Insert or replace by id, stamping `updatedAt` for last-writer-wins merge. */
function upsert<T extends WithId>(records: T[], record: T): T[] {
  const existing = records.find((r) => r.id === record.id)
  const stamped = { ...record, updatedAt: syncTimestamp(existing?.updatedAt) }
  return existing
    ? records.map((r) => (r.id === record.id ? stamped : r))
    : [...records, stamped]
}

/** Removes the matching records from each collection and tombstones them. */
function removeWhere(
  state: State,
  match: Partial<{ [K in Collection]: (record: State[K][number]) => boolean }>
): Partial<State> {
  const tombstones: MileageTombstone[] = []
  const next: Partial<State> = {}
  for (const key of Object.keys(match) as Collection[]) {
    const predicate = match[key] as (record: WithId) => boolean
    const records = state[key] as WithId[]
    const kept = records.filter((record) => {
      if (!predicate(record)) return true
      tombstones.push({
        id: record.id,
        deletedAt: syncTimestamp(record.updatedAt),
      })
      return false
    })
    if (kept.length !== records.length) Object.assign(next, { [key]: kept })
  }
  if (tombstones.length === 0) return {}
  const deletedIds = new Set(tombstones.map((t) => t.id))
  return {
    ...next,
    deletedMileageRecords: [
      ...state.deletedMileageRecords.filter((t) => !deletedIds.has(t.id)),
      ...tombstones,
    ],
  }
}

/**
 * Persisted store for Mileage Tracking: cars, fuels, their effective-dated
 * price/setup histories, and trips. Sync-aware like `categories`: every
 * mutation stamps `updatedAt`, and deletions leave tombstones.
 */
export const useMileage = create(
  persist(
    combine(initialState, (set) => ({
      set,
      saveVehicle: (vehicle: Vehicle) =>
        set((state) => ({ vehicles: upsert(state.vehicles, vehicle) })),
      /** Deletes the car with its fuel setups and trips. */
      deleteVehicle: (id: string) =>
        set((state) =>
          removeWhere(state, {
            vehicles: (v) => v.id === id,
            vehicleSetups: (s) => s.vehicleId === id,
            trips: (t) => t.vehicleId === id,
          })
        ),
      saveFuel: (fuel: Fuel) =>
        set((state) => ({ fuels: upsert(state.fuels, fuel) })),
      /**
       * Deletes the fuel and its prices. Car setups keep the dangling id and
       * simply stop producing an estimated cost.
       */
      deleteFuel: (id: string) =>
        set((state) =>
          removeWhere(state, {
            fuels: (f) => f.id === id,
            fuelPrices: (p) => p.fuelId === id,
          })
        ),
      saveFuelPrice: (price: FuelPrice) =>
        set((state) => ({ fuelPrices: upsert(state.fuelPrices, price) })),
      deleteFuelPrice: (id: string) =>
        set((state) => removeWhere(state, { fuelPrices: (p) => p.id === id })),
      saveVehicleSetup: (setup: VehicleSetup) =>
        set((state) => ({
          vehicleSetups: upsert(state.vehicleSetups, setup),
        })),
      deleteVehicleSetup: (id: string) =>
        set((state) =>
          removeWhere(state, { vehicleSetups: (s) => s.id === id })
        ),
      saveTrip: (trip: Trip) =>
        set((state) => ({ trips: upsert(state.trips, trip) })),
      deleteTrip: (id: string) =>
        set((state) => removeWhere(state, { trips: (t) => t.id === id })),
      /** Tombstones every mileage record, on every synced device. */
      deleteAllMileageData: () =>
        set((state) =>
          removeWhere(state, {
            vehicles: () => true,
            fuels: () => true,
            fuelPrices: () => true,
            vehicleSetups: () => true,
            trips: () => true,
          })
        ),
      _WARNING_forceDeleteMileage: () => set(initialState),
    })),
    {
      name: 'mileage',
      storage: createJSONStorage(() => PersistStorage),
      version: 0,
    }
  )
)

export default useMileage
