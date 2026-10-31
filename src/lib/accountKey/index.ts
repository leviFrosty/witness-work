import { Platform } from 'react-native'
import { MMKV } from 'react-native-mmkv'
import * as BuddiesKeychain from '../../../modules/buddies-keychain'
import { fromB64u } from '@/lib/bytes'
import { createDeviceAccountKey } from '@/lib/accountKey/deviceAccountKey'
import type {
  KeyChangeRecord,
  KeyChangeRecordStore,
} from '@/lib/accountKey/keyChangeRecord'
import {
  keyChangedElsewhere,
  parseKeyChangedElsewhere,
  useKeyChangedElsewhere,
} from '@/lib/accountKey/keyChangedElsewhere'
import { nativeKeyChangeRecordStore } from '@/lib/accountKey/nativeKeyChangeRecordStore'
import { webAccountKey } from '@/lib/accountKey/webAccountKey'
import { webKeyChangeRecordStore } from '@/lib/accountKey/webKeyChangeRecordStore'

/**
 * This device's account key as every feature reads it (`deviceAccountKey.ts`),
 * wired to the native stores, or the browser's sealed IndexedDB. Features read
 * the key here, never from `modules/buddies-keychain` directly, so a committed
 * key change and a retired key apply everywhere.
 */

const isWeb = Platform.OS === 'web'
const recordStore = isWeb ? webKeyChangeRecordStore : nativeKeyChangeRecordStore

let cachedRecord: Promise<KeyChangeRecord | null> | null = null

/**
 * The change record, read once and kept in memory: the account key is read on
 * most account calls.
 */
export const keyChangeRecords: KeyChangeRecordStore = {
  read: () =>
    (cachedRecord ??= recordStore.read().catch((error) => {
      cachedRecord = null
      throw error
    })),
  write: async (record) => {
    await recordStore.write(record)
    cachedRecord = Promise.resolve(record)
  },
  remove: async () => {
    await recordStore.remove()
    cachedRecord = Promise.resolve(null)
  },
}

/**
 * Whether this binary can keep a change record (and so change the key). A
 * browser stores the new key itself (`replace` below); it doesn't replace its
 * key any other way.
 */
export const keyChangeAvailable = () =>
  recordStore.isAvailable() && (isWeb || BuddiesKeychain.isReplaceAvailable())

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
    // Only a key change replaces a browser's key; a sign-in as another
    // account wipes the browser first (`webAccount`).
    replace: isWeb
      ? (key) => webAccountKey.save(fromB64u(key))
      : BuddiesKeychain.replaceRootSeed,
    // Only a retired key: a browser drops its key alone for no other reason,
    // and checks the stored one is still it.
    remove: isWeb
      ? async (accountPub) => {
          await webAccountKey.retire(accountPub)
        }
      : () => BuddiesKeychain.deleteRootSeed(),
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
