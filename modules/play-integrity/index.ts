import { Platform, requireOptionalNativeModule } from 'expo-modules-core'
import {
  PlayIntegrityError,
  codeFromNativeError,
  type PlayIntegrityErrorCode,
} from './errorCodes'

interface PlayIntegrityNative {
  isSupported(): boolean
  prepare(cloudProjectNumber: string): Promise<void>
  requestToken(cloudProjectNumber: string, requestHash: string): Promise<string>
}

const native = requireOptionalNativeModule<PlayIntegrityNative>('PlayIntegrity')

export { PlayIntegrityError, type PlayIntegrityErrorCode }

/** Whether this binary can request Play Integrity tokens (Android only). */
export function isSupported(): boolean {
  if (Platform.OS !== 'android' || !native) return false
  return native.isSupported()
}

const required = (): PlayIntegrityNative => {
  if (Platform.OS !== 'android' || !native) {
    throw new PlayIntegrityError('unsupported')
  }
  return native
}

const invoke = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof PlayIntegrityError) throw error
    throw new PlayIntegrityError(codeFromNativeError(error))
  }
}

/** Stable taxonomy for lifecycle decisions; never inspects localized text. */
export function classifyError(error: unknown): PlayIntegrityErrorCode | null {
  return error instanceof PlayIntegrityError ? error.code : null
}

/**
 * Warms up the standard-request token provider for `cloudProjectNumber`. Takes
 * a few seconds; call it ahead of the first token request.
 */
export function prepare(cloudProjectNumber: string): Promise<void> {
  return invoke(() => required().prepare(cloudProjectNumber))
}

/**
 * Requests a standard integrity token whose verdict carries `requestHash` (at
 * most 500 characters) verbatim. Prepares the provider when needed.
 */
export function requestToken(
  cloudProjectNumber: string,
  requestHash: string
): Promise<string> {
  return invoke(() => required().requestToken(cloudProjectNumber, requestHash))
}
