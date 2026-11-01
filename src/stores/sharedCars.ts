import { create, createStore, type StoreApi } from 'zustand'
import { combine, createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { PersistStorage } from '@/stores/mmkv'
import { canonicalJson } from '@/lib/canonicalJson'
import {
  matchFuel,
  matchRecord,
  matchVehicle,
  removeMileageRecords,
  upsertMileageRecord,
  type MileageCollection,
  type MileageMatch,
  type MileageRecord,
} from '@/lib/mileage/records'
import {
  attributedTrip,
  collectionHolding,
  KIND_OF_COLLECTION,
  mileageRecordOn,
  sharedRecordStamp,
  withPending,
  withSharedCarDefaults,
} from '@/lib/mileage/sharedCar'
import type {
  Fuel,
  FuelPrice,
  MileageSnapshot,
  Trip,
  Vehicle,
  VehicleSetup,
} from '@/types/mileage'
import type {
  SharedCar,
  SharedCarClosingInvite,
  SharedCarJoining,
  SharedCarMemberships,
  SharedCarPendingEnd,
  SharedCarSeeding,
} from '@/types/sharedCars'

const initialState = {
  cars: {} as Record<string, SharedCar>,

  memberships: { cars: {}, leftCars: {} } as SharedCarMemberships,

  seeding: {} as Record<string, SharedCarSeeding>,

  pendingEnds: {} as Record<string, SharedCarPendingEnd>,

  joining: {} as Record<string, SharedCarJoining>,

  closingInvites: {} as Record<string, Record<string, SharedCarClosingInvite>>,
}

type State = typeof initialState

type CarChange = { changes: Partial<SharedCar>; ids: string[] }

function changeCar(
  state: State,
  spaceId: string,
  change: (car: SharedCar) => CarChange
): Pick<State, 'cars'> | State {
  const car = state.cars[spaceId]
  if (!car) return state
  const { changes, ids } = change(car)
  if (ids.length === 0) return state
  return {
    cars: {
      ...state.cars,
      [spaceId]: {
        ...car,
        ...changes,
        pendingPuts: withPending(car.pendingPuts, ids),
      },
    },
  }
}

const NOTE_FIELDS = ['note', 'noteDoc']

function keptAfterEdit(
  car: SharedCar,
  previous: MileageRecord | undefined,
  record: MileageRecord
): Partial<SharedCar> {
  const kept = car.extraFields[record.id]
  if (!kept || !NOTE_FIELDS.some((name) => name in kept)) return {}
  const before = (previous ?? {}) as Record<string, unknown>
  const after = record as Record<string, unknown>
  const edited = NOTE_FIELDS.some(
    (name) => canonicalJson(before[name]) !== canonicalJson(after[name])
  )
  if (!edited) return {}
  const rest = Object.fromEntries(
    Object.entries(kept).filter(([name]) => !NOTE_FIELDS.includes(name))
  )
  const { [record.id]: _edited, ...others } = car.extraFields
  return {
    extraFields:
      Object.keys(rest).length > 0 ? { ...others, [record.id]: rest } : others,
  }
}

const upsert =
  <K extends MileageCollection>(key: K, record: MileageRecord<K>) =>
  (car: SharedCar): CarChange => ({
    changes: {
      ...upsertMileageRecord(car as MileageSnapshot, key, record),
      ...keptAfterEdit(car, mileageRecordOn(car, record.id), record),
    },
    ids: [record.id],
  })

const remove =
  (match: MileageMatch) =>
  (car: SharedCar): CarChange => {
    const { changes, removedIds } = removeMileageRecords(
      car as MileageSnapshot,
      match
    )
    if (removedIds.length === 0) return { changes: {}, ids: [] }
    const kinds = new Map(
      removedIds.map((id) => {
        const key = collectionHolding(car, id)
        return [id, key && KIND_OF_COLLECTION[key]] as const
      })
    )
    return {
      changes: {
        ...changes,
        deletedMileageRecords: (changes.deletedMileageRecords ?? []).map(
          (tombstone) => {
            const kind = kinds.get(tombstone.id)
            return kind ? { ...tombstone, kind } : tombstone
          }
        ),
      } as Partial<SharedCar>,
      ids: removedIds,
    }
  }

function tripElsewhere(
  state: State,
  spaceId: string,
  id: string
): { car: SharedCar; trip: Trip } | undefined {
  for (const car of Object.values(state.cars)) {
    if (car.spaceId === spaceId || collectionHolding(car, id) !== 'trips')
      continue
    return { car, trip: mileageRecordOn(car, id) as Trip }
  }
  return undefined
}

type Set = (
  partial: State | Partial<State> | ((state: State) => State | Partial<State>)
) => void

const actions = (set: Set) => ({
  saveVehicle: (spaceId: string, vehicle: Vehicle) =>
    set((state) => changeCar(state, spaceId, upsert('vehicles', vehicle))),

  deleteVehicle: (spaceId: string, id: string) =>
    set((state) => changeCar(state, spaceId, remove(matchVehicle(id)))),
  saveFuel: (spaceId: string, fuel: Fuel) =>
    set((state) => changeCar(state, spaceId, upsert('fuels', fuel))),

  deleteFuel: (spaceId: string, id: string) =>
    set((state) => changeCar(state, spaceId, remove(matchFuel(id)))),
  saveFuelPrice: (spaceId: string, price: FuelPrice) =>
    set((state) => changeCar(state, spaceId, upsert('fuelPrices', price))),
  deleteFuelPrice: (spaceId: string, id: string) =>
    set((state) =>
      changeCar(state, spaceId, remove(matchRecord('fuelPrices', id)))
    ),
  saveVehicleSetup: (spaceId: string, setup: VehicleSetup) =>
    set((state) => changeCar(state, spaceId, upsert('vehicleSetups', setup))),
  deleteVehicleSetup: (spaceId: string, id: string) =>
    set((state) =>
      changeCar(state, spaceId, remove(matchRecord('vehicleSetups', id)))
    ),

  saveTrip: (spaceId: string, trip: Trip) =>
    set((state) =>
      changeCar(state, spaceId, (car) =>
        upsert(
          'trips',
          attributedTrip(car, trip, tripElsewhere(state, spaceId, trip.id))
        )(car)
      )
    ),
  deleteTrip: (spaceId: string, id: string) =>
    set((state) => changeCar(state, spaceId, remove(matchRecord('trips', id)))),

  saveSharedCar: (car: SharedCar) =>
    set((state) => ({ cars: { ...state.cars, [car.spaceId]: car } })),

  updateSharedCar: (spaceId: string, update: (car: SharedCar) => SharedCar) =>
    set((state) => {
      const car = state.cars[spaceId]
      if (!car) return state
      const next = update(car)
      return next === car ? state : { cars: { ...state.cars, [spaceId]: next } }
    }),

  removeSharedCar: (spaceId: string) =>
    set((state) => {
      if (!state.cars[spaceId] && !state.closingInvites[spaceId]) return state
      const { [spaceId]: _removed, ...cars } = state.cars
      const { [spaceId]: _closing, ...closingInvites } = state.closingInvites
      return { cars, closingInvites }
    }),

  settlePendingPuts: (
    spaceId: string,
    sent: readonly { recordId: string; stamp: number }[]
  ) =>
    set((state) => {
      const car = state.cars[spaceId]
      if (!car) return state
      const settled = new Set(
        sent
          .filter(
            ({ recordId, stamp }) =>
              (sharedRecordStamp(car, recordId) ?? stamp) <= stamp
          )
          .map(({ recordId }) => recordId)
      )
      const pendingPuts = car.pendingPuts.filter((id) => !settled.has(id))
      if (pendingPuts.length === car.pendingPuts.length) return state
      return { cars: { ...state.cars, [spaceId]: { ...car, pendingPuts } } }
    }),

  noteJoined: (spaceId: string, at: number) =>
    set((state) => {
      const current = state.memberships.cars[spaceId]
      const owed = state.pendingEnds[spaceId] !== undefined
      if (current && current.at >= at && !owed) return state
      const { [spaceId]: _owed, ...pendingEnds } = state.pendingEnds
      return {
        ...(!(current && current.at >= at) && {
          memberships: {
            ...state.memberships,
            cars: { ...state.memberships.cars, [spaceId]: { at } },
          },
        }),
        ...(owed && { pendingEnds }),
      }
    }),

  noteLeft: (spaceId: string, at: number) =>
    set((state) => {
      const current = state.memberships.leftCars[spaceId]
      if (current !== undefined && current >= at) return state
      return {
        memberships: {
          ...state.memberships,
          leftCars: { ...state.memberships.leftCars, [spaceId]: at },
        },
      }
    }),

  saveSeeding: (seeding: SharedCarSeeding) =>
    set((state) => ({
      seeding: { ...state.seeding, [seeding.spaceId]: seeding },
    })),
  clearSeeding: (spaceId: string) =>
    set((state) => {
      if (!state.seeding[spaceId]) return state
      const { [spaceId]: _done, ...seeding } = state.seeding
      return { seeding }
    }),

  saveJoining: (joining: SharedCarJoining) =>
    set((state) => ({
      joining: { ...state.joining, [joining.spaceId]: joining },
    })),
  clearJoining: (spaceId: string) =>
    set((state) => {
      if (!state.joining[spaceId]) return state
      const { [spaceId]: _done, ...joining } = state.joining
      return { joining }
    }),
  setPendingEnd: (spaceId: string, end: SharedCarPendingEnd) =>
    set((state) =>
      state.pendingEnds[spaceId] === end
        ? state
        : { pendingEnds: { ...state.pendingEnds, [spaceId]: end } }
    ),
  clearPendingEnd: (spaceId: string) =>
    set((state) => {
      if (!state.pendingEnds[spaceId]) return state
      const { [spaceId]: _done, ...pendingEnds } = state.pendingEnds
      return { pendingEnds }
    }),

  addClosingInvite: (
    spaceId: string,
    inviteId: string,
    close: SharedCarClosingInvite
  ) =>
    set((state) => {
      const current = state.closingInvites[spaceId]?.[inviteId]

      if (current && (current.tag === undefined || current.tag === close.tag))
        return state
      return {
        closingInvites: {
          ...state.closingInvites,
          [spaceId]: { ...state.closingInvites[spaceId], [inviteId]: close },
        },
      }
    }),

  clearClosingInvite: (spaceId: string, inviteId: string) =>
    set((state) => {
      const closing = state.closingInvites[spaceId]
      if (!closing?.[inviteId]) return state
      const { [inviteId]: _done, ...rest } = closing
      const { [spaceId]: _space, ...others } = state.closingInvites
      return {
        closingInvites:
          Object.keys(rest).length > 0
            ? { ...others, [spaceId]: rest }
            : others,
      }
    }),

  oweInvite: (spaceId: string, inviteId: string) =>
    set((state) => {
      const car = state.cars[spaceId]
      if (!car?.inviteRecords.some((invite) => invite.inviteId === inviteId))
        return state
      const sent = car.sentInvites[inviteId]
      if (sent?.owed) return state
      return {
        cars: {
          ...state.cars,
          [spaceId]: {
            ...car,
            sentInvites: {
              ...car.sentInvites,
              [inviteId]: { epoch: sent?.epoch ?? car.epoch, owed: true },
            },
          },
        },
      }
    }),

  reset: () => set(() => ({ ...initialState })),
})

const initializer = combine(initialState, (set) => actions(set as Set))

export type SharedCarsState = ReturnType<typeof initializer>

export const useSharedCars = create(
  persist(initializer, {
    name: 'sharedCars',
    storage: createJSONStorage(() => PersistStorage),
    version: 0,
    migrate: keepPersistedState,

    merge: (persisted, current) => {
      const restored = (persisted ?? {}) as Partial<State>
      return {
        ...current,
        ...restored,
        cars: Object.fromEntries(
          Object.entries(restored.cars ?? {}).map(([spaceId, car]) => [
            spaceId,
            withSharedCarDefaults(car),
          ])
        ),
        memberships: {
          cars: restored.memberships?.cars ?? {},
          leftCars: restored.memberships?.leftCars ?? {},
        },
        closingInvites: restored.closingInvites ?? {},
        joining: restored.joining ?? {},
      }
    },
  })
)

export const createSharedCarsMemoryStore = () => createStore(initializer)

export type SharedCarsStore = Pick<
  StoreApi<SharedCarsState>,
  'getState' | 'setState' | 'subscribe'
>

export default useSharedCars
