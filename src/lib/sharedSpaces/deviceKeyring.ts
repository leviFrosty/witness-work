import { logger } from '@/lib/logger'
import {
  createSpaceKeyring,
  type SpaceKeyringStorage,
} from '@/lib/sharedSpaces/keyring'
import * as DeviceSecrets from '../../../modules/device-secrets'

/**
 * This device's keyring: the space keys it trusts. It's a cache, kept where
 * nothing that saves or sends a store (sync, our backups, the Buddies roster)
 * can reach it, and out of device backups: a this-device-only Keychain item on
 * iOS, and a file sealed under the Android Keystore in `noBackupFilesDir` on
 * Android (`modules/device-secrets`), as the account session's refresh token
 * is.
 *
 * A binary without that module keeps the keyring in memory for the launch: each
 * sync trusts the current key again from the device's wrap, the key chain and
 * the User's key check. A reset forgets them with the spaces' local copies.
 */

const SECRET = 'shared-spaces-keyring'

let memory: string | null = null

export const deviceKeyringStorage: SpaceKeyringStorage = {
  read: async () => {
    if (!DeviceSecrets.isAvailable()) return memory
    return DeviceSecrets.read(SECRET)
  },
  write: async (value) => {
    if (!DeviceSecrets.isAvailable()) {
      memory = value
      return
    }
    if (value === null) await DeviceSecrets.remove(SECRET)
    else await DeviceSecrets.write(SECRET, value)
  },
}

export const deviceSpaceKeyring = createSpaceKeyring(deviceKeyringStorage, {
  onError: (error) =>
    logger.warn(
      '[sharedCars] keyring storage',
      error instanceof Error ? error.name : 'unknown'
    ),
})

/** Forgets every space key on this device (Tools "Reset all"). */
export function forgetDeviceSpaceKeys() {
  deviceSpaceKeyring.forgetAll()
}
