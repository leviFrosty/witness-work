import { Platform, requireOptionalNativeModule } from 'expo-modules-core'

interface DeviceSecretsNative {
  deviceSecretsVersion?: number
  /** Null means only that there is none (or none this device can open). */
  read(name: string): Promise<string | null>
  write(name: string, value: string): Promise<void>
  remove(name: string): Promise<void>
}

const native = requireOptionalNativeModule<DeviceSecretsNative>('DeviceSecrets')

const NAME = /^[a-z0-9.-]{1,64}$/

const checked = (name: string) => {
  if (!NAME.test(name)) throw new Error('Invalid device secret name')
  return name
}

/**
 * Whether this binary has the module. OTA updates can run against older
 * binaries without it; callers then keep the secret in memory only.
 */
export function isAvailable(): boolean {
  return (
    (Platform.OS === 'ios' || Platform.OS === 'android') &&
    native !== null &&
    (native.deviceSecretsVersion ?? 0) >= 1
  )
}

/**
 * A secret kept on this device only: a this-device-only Keychain item that
 * never syncs (iOS), or a file sealed under the Android Keystore that Auto
 * Backup skips. Null when there's none. Errors throw.
 */
export async function read(name: string): Promise<string | null> {
  if (!isAvailable()) return null
  return native!.read(checked(name))
}

export async function write(name: string, value: string): Promise<void> {
  if (!isAvailable()) {
    throw new Error('Device secrets require a newer native binary')
  }
  await native!.write(checked(name), value)
}

export async function remove(name: string): Promise<void> {
  if (!isAvailable()) return
  await native!.remove(checked(name))
}
