import { Platform } from 'react-native'
import { MMKV } from 'react-native-mmkv'
import * as BuddiesKeychain from '../../../modules/buddies-keychain'
import { createDeviceAccountKey } from '@/lib/accountKey/deviceAccountKey'
import {
  isUnfinished,
  type KeyChangeRecord,
  type KeyChangeRecordStore,
} from '@/lib/accountKey/keyChangeRecord'
import {
  keyChangedElsewhere,
  parseKeyChangedElsewhere,
  useKeyChangedElsewhere,
} from '@/lib/accountKey/keyChangedElsewhere'
import { nativeKeyChangeRecordStore } from '@/lib/accountKey/nativeKeyChangeRecordStore'

/**
 * This device's account key as every feature reads it (`deviceAccountKey.ts`),
 * wired to the native stores. Features read the key here, never from
 * `modules/buddies-keychain` directly, so a committed key change and a retired
 * key apply everywhere.
 */

let cachedRecord: Promise<KeyChangeRecord | null> | null = null

/**
 * The change record, read once and kept in memory: the account key is read on
 * most account calls.
 */
export const keyChangeRecords: KeyChangeRecordStore = {
  read: () =>
    (cachedRecord ??= nativeKeyChangeRecordStore.read().catch((error) => {
      cachedRecord = null
      throw error
    })),
  write: async (record) => {
    await nativeKeyChangeRecordStore.write(record)
    cachedRecord = Promise.resolve(record)
  },
  remove: async () => {
    await nativeKeyChangeRecordStore.remove()
    cachedRecord = Promise.resolve(null)
  },
}

/** Whether this binary can keep a change record (and so change the key). */
export const keyChangeAvailable = () =>
  nativeKeyChangeRecordStore.isAvailable() &&
  BuddiesKeychain.isReplaceAvailable()

let launchHold: Promise<unknown> = Promise.resolve()

/**
 * Holds every read of the account key until `settled` resolves: a change record
 * found at launch is resolved first (docs/account-key-change.md, "The record
 * wins at launch"). Resolving it must not read the key here.
 */
export function holdAccountKeyUntil(settled: Promise<unknown>) {
  launchHold = settled.catch(() => undefined)
}

let _store: MMKV | null = null
const store = (): MMKV => (_store ??= new MMKV({ id: 'server-account' }))
const SIGNED_OUT_KEY = 'key-changed-elsewhere'

// Device-local, read before anything syncs or backs up.
useKeyChangedElsewhere.setState({
  signedOut: parseKeyChangedElsewhere(store().getString(SIGNED_OUT_KEY)),
})
useKeyChangedElsewhere.subscribe(({ signedOut }) => {
  if (signedOut) store().set(SIGNED_OUT_KEY, JSON.stringify(signedOut))
  else store().delete(SIGNED_OUT_KEY)
})

const RETIRED_KEY = 'retired-account-pubs'
const RETIRED_MAX = 20

const retiredPubs = (): string[] => {
  try {
    const value: unknown = JSON.parse(store().getString(RETIRED_KEY) ?? '[]')
    return Array.isArray(value)
      ? value.filter((pub): pub is string => typeof pub === 'string')
      : []
  } catch {
    return []
  }
}

export const deviceAccountKey = createDeviceAccountKey({
  native: {
    peek: BuddiesKeychain.peekRootSeed,
    getOrCreate: BuddiesKeychain.getOrCreateRootSeed,
    replace: BuddiesKeychain.replaceRootSeed,
    remove: BuddiesKeychain.deleteRootSeed,
  },
  record: async () => {
    await launchHold
    return keyChangeRecords.read()
  },
  // Public keys only; device-local, never synced.
  retired: {
    has: (pub) => retiredPubs().includes(pub),
    add: (pub) =>
      store().set(
        RETIRED_KEY,
        JSON.stringify(
          [...retiredPubs().filter((known) => known !== pub), pub].slice(
            -RETIRED_MAX
          )
        )
      ),
    delete: (pub) => {
      const known = retiredPubs()
      if (known.includes(pub))
        store().set(
          RETIRED_KEY,
          JSON.stringify(known.filter((entry) => entry !== pub))
        )
    },
  },
  // iCloud Keychain shares the item with the User's other Apple devices.
  sharedStore: Platform.OS === 'ios',
  signedOut: () => keyChangedElsewhere() !== null,
})

/**
 * The account key change on this device while it's unfinished (`isUnfinished`),
 * else null. Throws while the record can't be read: nothing is deleted on a
 * guess.
 */
export async function unfinishedKeyChange(): Promise<KeyChangeRecord | null> {
  const record = await keyChangeRecords.read()
  return isUnfinished(record) ? record : null
}
