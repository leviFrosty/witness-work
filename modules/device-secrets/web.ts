import { fromUtf8, utf8 } from '@/lib/bytes'
import type { SealedSecrets } from '@/lib/webStorage/sealedSecrets'

export const WEB_DEVICE_SECRET_PREFIX = 'device.'

const NAME = /^[a-z0-9.-]{1,64}$/

const checked = (name: string) => {
  if (!NAME.test(name)) throw new Error('Invalid device secret name')
  return WEB_DEVICE_SECRET_PREFIX + name
}

export function createWebDeviceSecrets({
  secrets,
  available,
}: {
  secrets: Pick<SealedSecrets, 'read' | 'write'>
  available: boolean
}) {
  return {
    isAvailable: () => available,
    async read(name: string): Promise<string | null> {
      if (!available) return null
      const sealed = await secrets.read(checked(name))
      return sealed ? fromUtf8(sealed) : null
    },
    async write(name: string, value: string): Promise<void> {
      if (!available) throw new Error('This browser can’t keep device secrets')
      await secrets.write(checked(name), utf8(value))
    },
    async remove(name: string): Promise<void> {
      if (!available) return
      await secrets.write(checked(name), null)
    },
  }
}
