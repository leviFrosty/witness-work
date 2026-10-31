import { beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  available: true,
  /** This device's keystore (`modules/device-secrets`), by name. */
  secrets: new Map<string, string>(),
}))

vi.mock('../../../modules/device-secrets', () => ({
  isAvailable: () => native.available,
  read: async (name: string) => native.secrets.get(name) ?? null,
  write: async (name: string, value: string) =>
    void native.secrets.set(name, value),
  remove: async (name: string) => void native.secrets.delete(name),
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

import { toB64u } from '@/lib/bytes'
import { createSpaceKeyring } from '@/lib/sharedSpaces/keyring'

const key = (fill: number) => new Uint8Array(32).fill(fill)

async function load() {
  vi.resetModules()
  return import('@/lib/sharedSpaces/deviceKeyring')
}

beforeEach(() => {
  native.available = true
  native.secrets.clear()
})

describe('the device keyring', () => {
  it('keeps space keys in this device’s keystore', async () => {
    const { deviceSpaceKeyring } = await load()
    await deviceSpaceKeyring.ready()
    deviceSpaceKeyring.trust('space', 1, key(1))
    await deviceSpaceKeyring.flushed()
    expect(JSON.parse(native.secrets.get('shared-spaces-keyring')!)).toEqual({
      space: { 1: toB64u(key(1)) },
    })
  })

  it('keeps keys in memory only on a binary without the keystore', async () => {
    native.available = false
    const { deviceSpaceKeyring, deviceKeyringStorage } = await load()
    await deviceSpaceKeyring.ready()
    deviceSpaceKeyring.trust('space', 1, key(1))
    await deviceSpaceKeyring.flushed()
    expect(native.secrets.size).toBe(0)
    // It lasts the launch; the next one starts empty, and rebuilds from the
    // wraps and the key chain.
    const next = createSpaceKeyring(deviceKeyringStorage)
    await next.ready()
    expect(next.key('space', 1)).toEqual(key(1))
    const relaunched = await load()
    await relaunched.deviceSpaceKeyring.ready()
    expect(relaunched.deviceSpaceKeyring.epochs('space')).toEqual([])
  })

  it('forgets everything on a reset', async () => {
    native.secrets.set(
      'shared-spaces-keyring',
      JSON.stringify({ a: { 1: toB64u(key(1)) } })
    )
    const { deviceSpaceKeyring, forgetDeviceSpaceKeys } = await load()
    forgetDeviceSpaceKeys()
    await deviceSpaceKeyring.ready()
    await deviceSpaceKeyring.flushed()
    expect(deviceSpaceKeyring.epochs('a')).toEqual([])
    expect(native.secrets.has('shared-spaces-keyring')).toBe(false)
  })
})
