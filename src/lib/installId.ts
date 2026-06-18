import { Platform } from 'react-native'
import * as Crypto from 'expo-crypto'
import { MMKV } from 'react-native-mmkv'
import * as KeychainUuid from '../../modules/keychain-uuid'

/**
 * Stable per-install identity (ADR 0007). On iOS it lives in the Keychain
 * (`AfterFirstUnlockThisDeviceOnly`, non-syncing) so it survives a normal
 * delete/reinstall; it is reused as the RevenueCat App User ID and the
 * Notes-Import server key. Off-iOS (or if the native module is missing — dev /
 * simulator), it falls back to an MMKV-persisted UUID so the app still has a
 * stable id, accepting that the fallback does not survive a reinstall.
 */

let _store: MMKV | null = null
const fallbackStore = (): MMKV => (_store ??= new MMKV({ id: 'install-id' }))
const FALLBACK_KEY = 'installId'

let _cached: string | null = null

export const getOrCreateInstallId = (): string => {
  if (_cached) return _cached

  if (Platform.OS === 'ios') {
    const fromKeychain = KeychainUuid.getOrCreate()
    if (fromKeychain) {
      _cached = fromKeychain
      return fromKeychain
    }
  }

  const store = fallbackStore()
  const existing = store.getString(FALLBACK_KEY)
  if (existing) {
    _cached = existing
    return existing
  }
  const created = Crypto.randomUUID()
  store.set(FALLBACK_KEY, created)
  _cached = created
  return created
}
