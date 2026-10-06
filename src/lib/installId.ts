import { Platform } from 'react-native'
import * as Application from 'expo-application'
import * as Crypto from 'expo-crypto'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { MMKV } from 'react-native-mmkv'
import * as KeychainUuid from '../../modules/keychain-uuid'

/**
 * Stable per-install identity (ADR 0007). On iOS it lives in the Keychain
 * (`AfterFirstUnlockThisDeviceOnly`, non-syncing) so it survives a normal
 * delete/reinstall; it is reused as the RevenueCat App User ID and the
 * Notes-Import server key. Elsewhere (or if the native module is missing — dev
 * / simulator) it is persisted in MMKV.
 *
 * On Android a new id is derived from `ANDROID_ID` (ADR 0017), which Android
 * scopes to this app's signing key, user, and device. Reinstalling or clearing
 * storage therefore derives the same id, as the Keychain does on iOS; a factory
 * reset changes it. An id already in MMKV always wins, so existing installs
 * keep the RevenueCat identity their purchases are filed under.
 */

let _store: MMKV | null = null
const fallbackStore = (): MMKV => (_store ??= new MMKV({ id: 'install-id' }))
const FALLBACK_KEY = 'installId'

let _cached: string | null = null

/**
 * A UUID-formatted (RFC 9562 version 8) digest of the app-scoped Android id.
 * Hashing keeps the raw id on the device; the package name separates the dev,
 * beta, and production apps when they share a signing key.
 */
export const androidInstallIdFrom = (
  androidId: string,
  applicationId: string
): string => {
  const bytes = sha256(
    utf8ToBytes(`witnesswork.install-id|1|${applicationId}|${androidId}`)
  ).slice(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x80
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytesToHex(bytes)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const androidSeededInstallId = (): string | null => {
  try {
    const androidId = Application.getAndroidId()
    const applicationId = Application.applicationId
    return androidId && applicationId
      ? androidInstallIdFrom(androidId, applicationId)
      : null
  } catch {
    return null
  }
}

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
  const created =
    (Platform.OS === 'android' ? androidSeededInstallId() : null) ??
    Crypto.randomUUID()
  store.set(FALLBACK_KEY, created)
  _cached = created
  return created
}
