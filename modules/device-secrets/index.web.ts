import { sealedSecrets } from '@/lib/webStorage/sealedSecrets'
import { secureKv } from '@/lib/webStorage/secureKv'
import { createWebDeviceSecrets } from './web'

/**
 * The web's device secrets, with the native module's API: sealed in IndexedDB
 * instead of the Keychain or the Android Keystore (`./web`).
 */
const secrets = createWebDeviceSecrets({
  secrets: sealedSecrets,
  available:
    secureKv.available && typeof globalThis.crypto?.subtle === 'object',
})

export const { isAvailable, read, write, remove } = secrets
