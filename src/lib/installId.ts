import { Platform } from 'react-native'
import * as Application from 'expo-application'
import * as Crypto from 'expo-crypto'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { MMKV } from 'react-native-mmkv'
import * as KeychainUuid from '../../modules/keychain-uuid'
import { errorTracking } from '@/lib/errorTracking'
import { logger } from '@/lib/logger'

let _store: MMKV | null = null
const fallbackStore = (): MMKV => (_store ??= new MMKV({ id: 'install-id' }))
const FALLBACK_KEY = 'installId'

let _cached: string | null = null
let _reportedUnavailable = false

export class InstallIdUnavailableError extends Error {
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

    if (!_reportedUnavailable) {
      _reportedUnavailable = true
      errorTracking.captureException(error, {
        keychain_status: unavailable.status,
      })
    }
    throw unavailable
  }
}

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

export const androidDeviceInstallId = (): string | null =>
  androidSeededInstallId()

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
    (Platform.OS === 'android' ? androidSeededInstallId() : null) ??
    Crypto.randomUUID()
  store.set(FALLBACK_KEY, created)
  _cached = created
  return created
}
