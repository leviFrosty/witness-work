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

export function classifyError(error: unknown): PlayIntegrityErrorCode | null {
  return error instanceof PlayIntegrityError ? error.code : null
}

export function prepare(cloudProjectNumber: string): Promise<void> {
  return invoke(() => required().prepare(cloudProjectNumber))
}

export function requestToken(
  cloudProjectNumber: string,
  requestHash: string
): Promise<string> {
  return invoke(() => required().requestToken(cloudProjectNumber, requestHash))
}
