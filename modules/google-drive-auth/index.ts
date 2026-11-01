import { Platform, requireOptionalNativeModule } from 'expo-modules-core'
import {
  GoogleDriveAuthError,
  googleDriveAuthErrorCode,
  type GoogleDriveAuthErrorCode,
} from './errorCodes'

interface GoogleDriveAuthNative {
  isSupported(): boolean
  authorize(interactive: boolean, selectAccount: boolean): Promise<string>
  clearToken(token: string): Promise<void>
}

const native =
  requireOptionalNativeModule<GoogleDriveAuthNative>('GoogleDriveAuth')

export { GoogleDriveAuthError, type GoogleDriveAuthErrorCode }

export function isSupported(): boolean {
  if (Platform.OS !== 'android' || !native) return false
  return native.isSupported()
}

const required = (): GoogleDriveAuthNative => {
  if (Platform.OS !== 'android' || !native) {
    throw new GoogleDriveAuthError('unavailable')
  }
  return native
}

const invoke = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof GoogleDriveAuthError) throw error
    throw new GoogleDriveAuthError(googleDriveAuthErrorCode(error))
  }
}

export function authorize(options: {
  interactive: boolean
  selectAccount?: boolean
}): Promise<string> {
  return invoke(() =>
    required().authorize(options.interactive, options.selectAccount ?? false)
  )
}

export function clearToken(token: string): Promise<void> {
  return invoke(() => required().clearToken(token))
}
