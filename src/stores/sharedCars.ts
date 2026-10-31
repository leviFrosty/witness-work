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
  /** Every Shared Car the User is on, by `spaceId`. */
  cars: {} as Record<string, SharedCar>,
  /**
   * The spaces the User is on and has left, which the Buddies roster carries to
   * their other devices (`cars`, `leftCars`).
   */
  memberships: { cars: {}, leftCars: {} } as SharedCarMemberships,
  /** Cars being shared that haven't finished seeding, by `spaceId`. */
  seeding: {} as Record<string, SharedCarSeeding>,
  /** Leaving or deleting a space the server hasn't heard yet, by `spaceId`. */
  pendingEnds: {} as Record<string, SharedCarPendingEnd>,
  /** Joins started whose answer hasn't been seen yet, by `spaceId`. */
  joining: {} as Record<string, SharedCarJoining>,
  /**
   * Invitations being closed that the server hasn't heard yet: `spaceId` →
   * `inviteId` → how. Tried on every sync of the car until it has.
   */
  closingInvites: {} as Record<string, Record<string, SharedCarClosingInvite>>,
}

type State = typeof initialState

/** A change to a car's records, and the ids of the records it touched. */
type CarChange = { changes: Partial<SharedCar>; ids: string[] }

/**
 * `state` with `change` made to the car in `spaceId` and the records it touched
 * marked pending. The same state for a car this device doesn't have, or a
 * change that touched nothing.
 */
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

/** Fields one edit replaces together: a note's plain text and its doc. */
const NOTE_FIELDS = ['note', 'noteDoc']

/**
 * The car's kept fields (`extraFields`) once the User saved `record` over
 * `previous`. A field the record sets goes out over the one kept for it anyway;
 * a note they edited also replaces a doc this version couldn't read, which
 * would otherwise go back out beside it.
 */
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

/**
 * Removes the matching records and tombstones them, each tombstone naming the
 * kind it was: its deletion is sealed with that kind.
 */
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

/** Trip `id` as another of the User's Shared Cars holds it, if one does. */
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
  /** Deletes the car with its fuel setups and trips. */
  deleteVehicle: (spaceId: string, id: string) =>
    set((state) => changeCar(state, spaceId, remove(matchVehicle(id)))),
  saveFuel: (spaceId: string, fuel: Fuel) =>
    set((state) => changeCar(state, spaceId, upsert('fuels', fuel))),
  /** Deletes the fuel and its prices. */
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
  /**
   * Saves a trip with who logged it, or who last edited it. A trip moving from
   * another Shared Car is saved here before it leaves that one, so it keeps who
   * logged it.
   */
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
  /**
   * Adds a car, or replaces one, exactly as given: for sharing, joining, and
   * merging a sync, whose records keep the stamps they came with.
   */
  saveSharedCar: (car: SharedCar) =>
    set((state) => ({ cars: { ...state.cars, [car.spaceId]: car } })),
  /**
   * Replaces a car with what `update` makes of it now, in one step, so nothing
   * changed between reading and writing it is lost. Nothing for a car this
   * device doesn't have, or an update that returns the same car.
   */
  updateSharedCar: (spaceId: string, update: (car: SharedCar) => SharedCar) =>
    set((state) => {
      const car = state.cars[spaceId]
      if (!car) return state
      const next = update(car)
      return next === car ? state : { cars: { ...state.cars, [spaceId]: next } }
    }),
  /**
   * Forgets a car on this device, e.g. once its personal copy is made, with the
   * invitations it was closing: the server closes those with the car.
   */
  removeSharedCar: (spaceId: string) =>
    set((state) => {
      if (!state.cars[spaceId] && !state.closingInvites[spaceId]) return state
      const { [spaceId]: _removed, ...cars } = state.cars
      const { [spaceId]: _closing, ...closingInvites } = state.closingInvites
      return { cars, closingInvites }
    }),
  /**
   * Clears the pending marks a `put` settled: each record it sent, stored or
   * already superseded on the server, unless it changed here again after the
   * stamp it was sent with. Linear in the car and the put.
   */
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
  /**
   * The User joined or shared `spaceId` at `at` (the synced clock). A leave
   * this device still owed the server goes: sent now, it would take them off
   * the car they're on again.
   */
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
  /** The User left `spaceId` at `at` (or was removed, or it ended). */
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
  /** Records or updates a share that's seeding. */
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
  /** Records a join about to go out, until its answer is seen. */
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
  /** Starts closing an invitation, until the server has heard. */
  addClosingInvite: (
    spaceId: string,
    inviteId: string,
    close: SharedCarClosingInvite
  ) =>
    set((state) => {
      const current = state.closingInvites[spaceId]?.[inviteId]
      // The User's own cancel (no tag) needs no one's word for it.
      if (current && (current.tag === undefined || current.tag === close.tag))
        return state
      return {
        closingInvites: {
          ...state.closingInvites,
          [spaceId]: { ...state.closingInvites[spaceId], [inviteId]: close },
        },
      }
    }),
  /** The server closed it, or there was nothing to close. */
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
  /**
   * An invitation this device sent whose `car.invite` can't go any more (its
   * secrets are gone): its car owes it again, keeping its record, and sends it
   * under a new id on a later sync, as after a rekey. Nothing for a car that
   * isn't here, or an invitation it holds no record of.
   */
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
  /**
   * Forgets every car and everything about them on this device, telling no one:
   * it signed out of the account, or its account key was replaced.
   */
  reset: () => set(() => ({ ...initialState })),
})

const initializer = combine(initialState, (set) => actions(set as Set))

export type SharedCarsState = ReturnType<typeof initializer>

/**
 * This device's copy of each Shared Car (ADR 0037), keyed by `spaceId`, and the
 * engine's bookkeeping: which spaces the User is on and has left, shares still
 * seeding, and ends the server hasn't heard. Its mileage mutations work like
 * `useMileage`'s, stamping `updatedAt` and leaving tombstones, and also mark
 * the records they touch pending until a `put` stores them.
 *
 * Device-local: the cars aren't in the iCloud, Google Drive, or Cloud Sync
 * payload, or in backups, since each space on ww-api is their source. No key or
 * invitation secret is ever kept here: those live in the keyring. Read through
 * `@/stores/mileageView` and write through `@/stores/mileageWrites`, which
 * route each change to the store its car lives in. The engine
 * (`src/app/sharedCars`) syncs it.
 */
export const useSharedCars = create(
  persist(initializer, {
    name: 'sharedCars',
    storage: createJSONStorage(() => PersistStorage),
    version: 0,
    migrate: keepPersistedState,
    // Cars saved before a field existed read it as its default.
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

/**
 * A store like `useSharedCars` held in memory only: each headless member of a
 * test or the interop check gets its own.
 */
export const createSharedCarsMemoryStore = () => createStore(initializer)

/** The store the engine reads and writes: `useSharedCars`, or a memory one. */
export type SharedCarsStore = Pick<
  StoreApi<SharedCarsState>,
  'getState' | 'setState' | 'subscribe'
>

export default useSharedCars
