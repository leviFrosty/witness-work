import { Platform, requireOptionalNativeModule } from 'expo-modules-core'
import {
  AppAttestError,
  codeFromNativeError,
  type AppAttestErrorCode,
} from './errorCodes'

interface AppAttestNative {
  isSupported(): boolean
  generateKey(): Promise<string>
  attestKey(keyId: string, clientDataHashBase64: string): Promise<string>
  generateAssertion(
    keyId: string,
    clientDataHashBase64: string
  ): Promise<string>
}

const native = requireOptionalNativeModule<AppAttestNative>('AppAttest')

export { AppAttestError, type AppAttestErrorCode }

export function isSupported(): boolean {
  if (Platform.OS !== 'ios' || !native) return false
  return native.isSupported()
}

const required = (): AppAttestNative => {
  if (Platform.OS !== 'ios' || !native) {
    throw new AppAttestError('unsupported')
  }
  return native
}

const invoke = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof AppAttestError) throw error
    throw new AppAttestError(codeFromNativeError(error))
  }
}

export function classifyError(error: unknown): AppAttestErrorCode | null {
  return error instanceof AppAttestError ? error.code : null
}

export function generateKey(): Promise<string> {
  return invoke(() => required().generateKey())
}

export function attestKey(
  keyId: string,
  clientDataHashBase64: string
): Promise<string> {
  return invoke(() => required().attestKey(keyId, clientDataHashBase64))
}

export function generateAssertion(
  keyId: string,
  clientDataHashBase64: string
): Promise<string> {
  return invoke(() => required().generateAssertion(keyId, clientDataHashBase64))
}
