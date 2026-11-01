import { logger } from '@/lib/logger'
import {
  createSpaceKeyring,
  type SpaceKeyringStorage,
} from '@/lib/sharedSpaces/keyring'
import * as DeviceSecrets from '../../../modules/device-secrets'

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

export function forgetDeviceSpaceKeys() {
  deviceSpaceKeyring.forgetAll()
}
