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

export const emptyMileage = (): MileageSnapshot => ({
  vehicles: [],
  fuels: [],
  fuelPrices: [],
  vehicleSetups: [],
  trips: [],
  deletedMileageRecords: [],
})

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

  seed?: Uint8Array

  inboxId?: string

  now?: () => number

  syncNow?: () => number

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

    savePersonal<K extends MileageCollection>(
      key: K,
      record: MileageRecord<K>
    ) {
      personal = { ...personal, ...upsertMileageRecord(personal, key, record) }
    },

    mergePersonal(records: Partial<MileageSnapshot>) {
      personal = { ...personal, ...mergeMileageRecords(personal, records) }
    },

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

    async relaunch(lose: { keyring?: boolean; store?: boolean } = {}) {
      member.engine.cancel()
      await keyring.flushed()
      if (lose.keyring) keyringStorage = memoryKeyringStorage()
      if (lose.store) store.getState().reset()
      keyring = createSpaceKeyring(keyringStorage)
      member.keyring = keyring
      member.engine = makeEngine()
    },

    keyringStored: () => keyringStorage.value(),
  }
  return member
}

export type HeadlessMember = ReturnType<typeof createHeadlessMember>
