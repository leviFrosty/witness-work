import { getRandomBytes } from 'expo-crypto'
import { MMKV } from 'react-native-mmkv'
import apis from '@/constants/apis'
import { syncNow } from '@/lib/syncClock'
import { registerAccount } from '@/lib/serverAccount/client'
import {
  type CachedServerAccount,
  createServerAccount,
} from '@/lib/serverAccount/serverAccount'

let _store: MMKV | null = null
// Device-local MMKV, like ADR 0011's account id: never in the sync payload.
const store = (): MMKV => (_store ??= new MMKV({ id: 'server-account' }))
const KEY = 'account'

/** This device's server account (ADR 0024). */
export const serverAccount = createServerAccount({
  register: (key) =>
    registerAccount({
      baseUrl: apis.accounts,
      key,
      now: syncNow,
      randomBytes: getRandomBytes,
    }),
  storage: {
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
  },
  now: Date.now,
})
