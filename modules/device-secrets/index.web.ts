import { sealedSecrets } from '@/lib/webStorage/sealedSecrets'
import { secureKv } from '@/lib/webStorage/secureKv'
import { createWebDeviceSecrets } from './web'

const secrets = createWebDeviceSecrets({
  secrets: sealedSecrets,
  available:
    secureKv.available && typeof globalThis.crypto?.subtle === 'object',
})

export const { isAvailable, read, write, remove } = secrets
