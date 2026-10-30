import { Platform } from 'react-native'
import * as Application from 'expo-application'
import * as Crypto from 'expo-crypto'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { MMKV } from 'react-native-mmkv'
import * as KeychainUuid from '../../modules/keychain-uuid'
import { errorTracking } from '@/lib/errorTracking'
import { logger } from '@/lib/logger'

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
let _reportedUnavailable = false

/**
 * The Keychain refused the install id, usually because the app ran before the
 * device's first unlock. Nothing is cached or stored in its place: a stand-in
 * id would fork the identity once the Keychain reads again, so callers retry
 * later. Already reported, so callers needn't report it again.
 */
export class InstallIdUnavailableError extends Error {
  /** The Keychain's `OSStatus`, or null on binaries that don't report it. */
  readonly status: number | null

  constructor(cause: unknown) {
    super('Install id unavailable: the Keychain could not be read', { cause })
    this.name = 'InstallIdUnavailableError'
    const message = cause instanceof Error ? cause.message : String(cause)
    const status = /OSStatus (-?\d+)/.exec(message)?.[1]
    this.status = status === undefined ? null : Number(status)
  }
}

const keychainInstallId = (): string | null => {
  try {
    return KeychainUuid.getOrCreate()
  } catch (error) {
    const unavailable = new InstallIdUnavailableError(error)
    logger.warn('[installId] Keychain unavailable', unavailable.status)
    // Once per launch: every caller retries, and each would report it again.
    if (!_reportedUnavailable) {
      _reportedUnavailable = true
      errorTracking.captureException(error, {
        keychain_status: unavailable.status,
      })
    }
    throw unavailable
  }
}

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

/**
 * Android: the install id derived from this device's `ANDROID_ID`, ignoring any
 * id stored in MMKV. A phone restored from another one's backup derives a
 * different id, which is how sync tells a copy from the original. Null when
 * `ANDROID_ID` can't be read.
 */
export const androidDeviceInstallId = (): string | null =>
  androidSeededInstallId()

/** Throws `InstallIdUnavailableError` while the iOS Keychain can't be read. */
export const getOrCreateInstallId = (): string => {
  if (_cached) return _cached

  if (Platform.OS === 'ios') {
    const fromKeychain = keychainInstallId()
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
    (Platform.OS === 'android' && androidSeededInstallId()) ||
    Crypto.randomUUID()
  store.set(FALLBACK_KEY, created)
  _cached = created
  return created
}
