import { Platform, requireOptionalNativeModule } from 'expo-modules-core'
import {
  NativePasskeyError,
  fromNativeError,
  type PasskeyErrorCode,
} from './errorCodes'
import { normalizeResponseJson } from './normalize'

export type PasskeySupport = {
  passkeys: boolean

  prf: 'yes' | 'no' | 'unknown'
}

interface PasskeysNative {
  passkeysVersion?: number
  getSupport(): Promise<PasskeySupport>
  create(optionsJson: string): Promise<string>
  get(optionsJson: string): Promise<string>
}

const native = requireOptionalNativeModule<PasskeysNative>('Passkeys')

export { NativePasskeyError, type PasskeyErrorCode }

export function isAvailable(): boolean {
  return (
    (Platform.OS === 'ios' || Platform.OS === 'android') &&
    native !== null &&
    (native.passkeysVersion ?? 0) >= 1
  )
}

export async function getSupport(): Promise<PasskeySupport> {
  if (!isAvailable()) return { passkeys: false, prf: 'no' }
  return native!.getSupport()
}

const invoke = async (operation: () => Promise<string>): Promise<string> => {
  if (!isAvailable()) throw new NativePasskeyError('not_supported')
  try {
    return normalizeResponseJson(await operation())
  } catch (error) {
    throw fromNativeError(error)
  }
}

export function create(optionsJson: string): Promise<string> {
  return invoke(() => native!.create(optionsJson))
}

export function get(optionsJson: string): Promise<string> {
  return invoke(() => native!.get(optionsJson))
}
