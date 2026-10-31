import { toB64u } from '@/lib/bytes'
import {
  matchEverything,
  mergeMileageRecords,
  type MileageCollection,
  type MileageRecord,
  removeMileageRecords,
  upsertMileageRecord,
} from '@/lib/mileage/records'
import type { SpacesClient } from '@/lib/sharedSpaces/client'
import {
  createSpaceKeyring,
  memoryKeyringStorage,
} from '@/lib/sharedSpaces/keyring'
import { createSharedCarsMemoryStore } from '@/stores/sharedCars'
import { createSharedCarsSessionStore } from '@/stores/sharedCarsSession'
import {
  createSharedCarsEngine,
  type ReissuedInvite,
  type SharedCarEnded,
  type SharedCarOutcome,
  type SharedCarsEngineDeps,
  type SharedCarShareFailed,
} from '@/app/sharedCars/engine'
import type { MileageSnapshot } from '@/types/mileage'

/**
 * One person's device running the Shared Cars engine headless, for tests and
 * the interop check: in-memory stores, keyring and personal mileage, a root
 * seed of its own (or a shared one, for a second device of the same User), and
 * a record of what the engine reported.
 */

export const emptyMileage = (): MileageSnapshot => ({
  vehicles: [],
  fuels: [],
  fuelPrices: [],
  vehicleSetups: [],
  trips: [],
  deletedMileageRecords: [],
})

/** A random version 4 UUID. */
export function uuidFrom(randomBytes: (length: number) => Uint8Array) {
  const bytes = randomBytes(16)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export type HeadlessMemberOptions = {
  name: string
  client: SpacesClient
  randomBytes: (length: number) => Uint8Array
  /** The User's root seed; pass another device's to be the same User. */
  seed?: Uint8Array
  /** The User's Buddies inbox id; made from the seed when absent. */
  inboxId?: string
  /** The device clock. */
  now?: () => number
  /**
   * The synced clock, which stamps follow (`syncNow`); the device clock when
   * absent. A device whose clock runs ahead of the server's before it's
   * calibrated has this ahead too.
   */
  syncNow?: () => number
  /** Engine dependencies to replace, e.g. `canSync`. */
  overrides?: Partial<SharedCarsEngineDeps>
}

export function createHeadlessMember(options: HeadlessMemberOptions) {
  const { client, randomBytes } = options
  const now = options.now ?? Date.now
  const syncNow = options.syncNow ?? now
  const seed = options.seed ?? randomBytes(32)
  const inboxId = options.inboxId ?? toB64u(seed.subarray(16, 32))
  const store = createSharedCarsMemoryStore()
  const status = createSharedCarsSessionStore()
  let keyringStorage = memoryKeyringStorage()
  let keyring = createSpaceKeyring(keyringStorage)
  const outcomes: SharedCarOutcome[] = []
  const reissued: ReissuedInvite[] = []
  const ended: SharedCarEnded[] = []
  const shareFailures: SharedCarShareFailed[] = []
  const errors: string[] = []
  let personal = emptyMileage()
  let name = options.name
  let lastStamp = 0

  const makeEngine = () =>
    createSharedCarsEngine({
      client,
      store,
      status,
      keyring,
      personal: {
        snapshot: () => personal,
        mergeRecords: (records) => {
          personal = { ...personal, ...mergeMileageRecords(personal, records) }
        },
      },
      rootSeed: async () => seed,
      profile: () => ({ name, inboxId }),
      randomBytes,
      randomUUID: () => uuidFrom(randomBytes),
      now,
      syncNow: () => syncNow(),
      // Monotonic, like `syncTimestamp`.
      stamp: (previous = 0) => {
        lastStamp = Math.max(Math.floor(syncNow()), previous + 1, lastStamp + 1)
        return lastStamp
      },
      onOutcome: (outcome) => outcomes.push(outcome),
      onCarEnded: (end) => ended.push(end),
      onShareFailed: (failed) => shareFailures.push(failed),
      onInviteReissued: (reissue) => reissued.push(reissue),
      onError: (_error, context) => errors.push(context),
      ...options.overrides,
    })

  const member = {
    name: options.name,
    engine: makeEngine(),
    store,
    status,
    keyring,
    seed,
    inboxId,
    outcomes,
    reissued,
    ended,
    shareFailures,
    errors,
    personal: () => personal,
    /** Saves a record in the User's own store, stamped as the app does. */
    savePersonal<K extends MileageCollection>(
      key: K,
      record: MileageRecord<K>
    ) {
      personal = { ...personal, ...upsertMileageRecord(personal, key, record) }
    },
    /** Merges records into the User's own store, keeping their stamps. */
    mergePersonal(records: Partial<MileageSnapshot>) {
      personal = { ...personal, ...mergeMileageRecords(personal, records) }
    },
    /** Delete All Mileage Data on the User's own store, as the app does. */
    deleteAllPersonal() {
      personal = {
        ...personal,
        ...removeMileageRecords(personal, matchEverything).changes,
      }
    },
    rename: (next: string) => {
      name = next
    },
    car: (spaceId: string) => store.getState().cars[spaceId],
    /**
     * The app starting again on this device: a new engine, with the stores and
     * personal mileage as they were, and the keyring read back from its
     * storage. `lose` starts it without the keyring (a device restored from a
     * backup) or the Shared Cars store (the app reinstalled), or both.
     */
    async relaunch(lose: { keyring?: boolean; store?: boolean } = {}) {
      member.engine.cancel()
      await keyring.flushed()
      if (lose.keyring) keyringStorage = memoryKeyringStorage()
      if (lose.store) store.getState().reset()
      keyring = createSpaceKeyring(keyringStorage)
      member.keyring = keyring
      member.engine = makeEngine()
    },
    /** What this device's keyring keeps in its storage. */
    keyringStored: () => keyringStorage.value(),
  }
  return member
}

export type HeadlessMember = ReturnType<typeof createHeadlessMember>
