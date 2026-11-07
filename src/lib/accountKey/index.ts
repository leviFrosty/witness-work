import { Platform } from 'react-native'
import { MMKV } from 'react-native-mmkv'
import * as BuddiesKeychain from '../../../modules/buddies-keychain'
import { fromB64u } from '@/lib/bytes'
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
import { webAccountKey } from '@/lib/accountKey/webAccountKey'
import { webKeyChangeRecordStore } from '@/lib/accountKey/webKeyChangeRecordStore'

const isWeb = Platform.OS === 'web'
const recordStore = isWeb ? webKeyChangeRecordStore : nativeKeyChangeRecordStore

let cachedRecord: Promise<KeyChangeRecord | null> | null = null

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

export const keyChangeAvailable = () =>
  recordStore.isAvailable() && (isWeb || BuddiesKeychain.isReplaceAvailable())

let launchHold: Promise<unknown> = Promise.resolve()

export function holdAccountKeyUntil(settled: Promise<unknown>) {
  launchHold = settled.catch(() => undefined)
}

let _store: MMKV | null = null
const store = (): MMKV => (_store ??= new MMKV({ id: 'server-account' }))
const SIGNED_OUT_KEY = 'key-changed-elsewhere'

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

    replace: isWeb
      ? (key) => webAccountKey.save(fromB64u(key))
      : BuddiesKeychain.replaceRootSeed,

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

  sharedStore: Platform.OS === 'ios',
  signedOut: () => keyChangedElsewhere() !== null,
})

export async function unfinishedKeyChange(): Promise<KeyChangeRecord | null> {
  const record = await keyChangeRecords.read()
  return isUnfinished(record) ? record : null
}
