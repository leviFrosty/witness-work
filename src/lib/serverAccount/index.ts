import { getRandomBytes } from 'expo-crypto'
import { MMKV } from 'react-native-mmkv'
import apis from '@/constants/apis'
import { syncNow } from '@/lib/syncClock'
import {
  fetchAccountInfo,
  registerAccount,
  type ServerAccountInfo,
} from '@/lib/serverAccount/client'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  type CachedServerAccount,
  createServerAccount,
  type ServerAccountStorage,
} from '@/lib/serverAccount/serverAccount'

let _store: MMKV | null = null
// Device-local MMKV, like ADR 0011's account id: never in the sync payload.
const store = (): MMKV => (_store ??= new MMKV({ id: 'server-account' }))
const KEY = 'account'

const storage: ServerAccountStorage = {
  get: () => {
    const raw = store().getString(KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as CachedServerAccount
    } catch {
      return null
    }
  },
  set: (value) =>
    value ? store().set(KEY, JSON.stringify(value)) : store().delete(KEY),
}

/** This device's server account (ADR 0024). */
export const serverAccount = createServerAccount({
  register: (key) =>
    registerAccount({
      baseUrl: apis.accounts,
      key,
      now: syncNow,
      randomBytes: getRandomBytes,
    }),
  info: (key) =>
    fetchAccountInfo({
      baseUrl: apis.accounts,
      key,
      now: syncNow,
      randomBytes: getRandomBytes,
    }),
  storage,
  now: Date.now,
})

/** What this device remembers about its server account, for the tools. */
export const cachedServerAccount = (): CachedServerAccount | null =>
  storage.get()

/** The server's record of this account key's account; never registers one. */
export const fetchServerAccountInfo = (
  accountKey: Uint8Array
): Promise<ServerAccountInfo> =>
  fetchAccountInfo({
    baseUrl: apis.accounts,
    key: deriveAccountSigningKey(accountKey),
    now: syncNow,
    randomBytes: getRandomBytes,
  })
