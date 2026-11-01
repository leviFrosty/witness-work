import { beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  available: true,

  secrets: new Map<string, string>(),
  calls: 0,
}))

vi.mock('../../../modules/device-secrets', () => ({
  isAvailable: () => native.available,
  read: async (name: string) => {
    native.calls += 1
    return native.secrets.get(name) ?? null
  },
  write: async (name: string, value: string) => {
    native.calls += 1
    native.secrets.set(name, value)
  },
  remove: async (name: string) => {
    native.calls += 1
    native.secrets.delete(name)
  },
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

import {
  createInviteSecretStore,
  type InviteSecretStorage,
  memoryInviteSecretStorage,
} from '@/lib/sharedSpaces/deviceInviteSecrets'

const secrets = (fill: string) => ({
  joinSecret: fill.repeat(43),
  key: fill.toUpperCase().repeat(43),
})

async function load() {
  vi.resetModules()
  return import('@/lib/sharedSpaces/deviceInviteSecrets')
}

function slowStorage(initial: string | null = null) {
  let value = initial
  let running = 0
  let overlapped = false
  const waiting: (() => void)[] = []
  const step = async () => {
    running += 1
    if (running > 1) overlapped = true
    await new Promise<void>((resolve) => waiting.push(resolve))
    running -= 1
  }
  const storage: InviteSecretStorage = {
    read: async () => {
      await step()
      return value
    },
    write: async (next) => {
      await step()
      value = next
    },
  }
  return {
    storage,
    value: () => value,
    overlapped: () => overlapped,

    async drain() {
      for (let i = 0; i < 50; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0))
        waiting.splice(0).forEach((resolve) => resolve())
      }
    },
  }
}

beforeEach(() => {
  native.available = true
  native.secrets.clear()
  native.calls = 0
})

describe('the device’s invitation secrets', () => {
  it('keeps them in this device’s keystore, by invitation', async () => {
    const { deviceInviteSecrets } = await load()
    deviceInviteSecrets.put('sent|a', secrets('a'))
    deviceInviteSecrets.put('received|b', secrets('b'))
    await deviceInviteSecrets.flushed()
    expect(JSON.parse(native.secrets.get('shared-spaces-invites')!)).toEqual({
      'sent|a': secrets('a'),
      'received|b': secrets('b'),
    })

    const relaunched = await load()
    expect(await relaunched.deviceInviteSecrets.ready()).toBe(true)
    expect(relaunched.deviceInviteSecrets.get('sent|a')).toEqual(secrets('a'))
    relaunched.deviceInviteSecrets.remove('sent|a')
    relaunched.deviceInviteSecrets.remove('received|b')
    await relaunched.deviceInviteSecrets.flushed()

    expect(native.secrets.has('shared-spaces-invites')).toBe(false)
  })

  it('touches no native storage until it’s used', async () => {
    const { deviceInviteSecrets } = await load()
    expect(native.calls).toBe(0)
    await deviceInviteSecrets.ready()
    expect(native.calls).toBe(1)
  })

  it('keeps them in memory only on a binary without the keystore', async () => {
    native.available = false
    const { deviceInviteSecrets, deviceInviteSecretStorage } = await load()
    deviceInviteSecrets.put('sent|a', secrets('a'))
    await deviceInviteSecrets.flushed()
    expect(native.secrets.size).toBe(0)

    const again = createInviteSecretStore(deviceInviteSecretStorage)
    expect(await again.ready()).toBe(true)
    expect(again.get('sent|a')).toEqual(secrets('a'))
    const relaunched = await load()
    expect(await relaunched.deviceInviteSecrets.ready()).toBe(true)
    expect(relaunched.deviceInviteSecrets.get('sent|a')).toBeNull()
  })

  it('writes one change after another, losing none', async () => {
    const slow = slowStorage(JSON.stringify({ old: secrets('o') }))
    const store = createInviteSecretStore(slow.storage)

    store.put('a', secrets('a'))
    store.remove('old')
    const draining = slow.drain()
    store.put('b', secrets('b'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    store.put('c', secrets('c'))
    store.remove('a')
    await draining
    await slow.drain()
    await store.flushed()
    expect(slow.overlapped()).toBe(false)
    expect(JSON.parse(slow.value()!)).toEqual({
      b: secrets('b'),
      c: secrets('c'),
    })
  })

  it('keeps what storage held when a change comes before it’s read', async () => {
    const storage = memoryInviteSecretStorage()
    await storage.write(JSON.stringify({ a: secrets('a') }))
    const store = createInviteSecretStore(storage)
    store.put('b', secrets('b'))
    await store.flushed()
    expect(JSON.parse(storage.value()!)).toEqual({
      a: secrets('a'),
      b: secrets('b'),
    })
  })

  it('lets go of what nothing needs, asked once storage is read', async () => {
    const storage = memoryInviteSecretStorage()
    await storage.write(
      JSON.stringify({ a: secrets('a'), orphan: secrets('o') })
    )
    const store = createInviteSecretStore(storage)
    let needed = new Set<string>()
    store.retain(() => needed)

    store.put('b', secrets('b'))
    needed = new Set(['a', 'b'])
    await store.flushed()
    expect(Object.keys(JSON.parse(storage.value()!)).sort()).toEqual(['a', 'b'])
    expect(store.get('orphan')).toBeNull()
  })

  it('says when storage can’t be read, and writes nothing over it until it can', async () => {
    const storage = memoryInviteSecretStorage()
    await storage.write(JSON.stringify({ a: secrets('a') }))
    const onError = vi.fn()
    let failing = true
    const store = createInviteSecretStore(
      {
        read: () => {
          if (failing) throw new Error('locked')
          return storage.read()
        },
        write: storage.write,
      },
      { onError }
    )
    expect(await store.ready()).toBe(false)
    expect(onError).toHaveBeenCalled()
    store.put('b', secrets('b'))
    store.retain(() => new Set(['b']))
    await store.flushed()
    expect(JSON.parse(storage.value()!)).toEqual({ a: secrets('a') })

    failing = false
    expect(await store.ready()).toBe(true)
    await store.flushed()
    expect(store.get('a')).toEqual(secrets('a'))
    expect(JSON.parse(storage.value()!)).toEqual({
      a: secrets('a'),
      b: secrets('b'),
    })
  })

  it('drops a damaged entry, keeping the rest', async () => {
    const storage = memoryInviteSecretStorage()
    await storage.write(
      JSON.stringify({ a: secrets('a'), b: { joinSecret: 1 }, c: null })
    )
    const store = createInviteSecretStore(storage)
    expect(await store.ready()).toBe(true)
    expect(store.get('a')).toEqual(secrets('a'))
    expect(store.get('b')).toBeNull()
    expect(store.get('c')).toBeNull()
  })

  it('forgets everything on a reset, even what it hasn’t read', async () => {
    native.secrets.set(
      'shared-spaces-invites',
      JSON.stringify({ a: secrets('a') })
    )
    const { deviceInviteSecrets, forgetDeviceInviteSecrets } = await load()
    forgetDeviceInviteSecrets()
    await deviceInviteSecrets.flushed()
    expect(native.secrets.has('shared-spaces-invites')).toBe(false)
    expect(await deviceInviteSecrets.ready()).toBe(true)
    expect(deviceInviteSecrets.get('a')).toBeNull()
  })
})
