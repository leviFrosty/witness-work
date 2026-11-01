import { Platform, requireOptionalNativeModule } from 'expo-modules-core'

interface DeviceSecretsNative {
  deviceSecretsVersion?: number

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

export function isAvailable(): boolean {
  return (
    (Platform.OS === 'ios' || Platform.OS === 'android') &&
    native !== null &&
    (native.deviceSecretsVersion ?? 0) >= 1
  )
}

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
