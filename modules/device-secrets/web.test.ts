import { describe, expect, it } from 'vitest'
import { createWebDeviceSecrets, WEB_DEVICE_SECRET_PREFIX } from './web'

function setup(available = true) {
  const stored = new Map<string, Uint8Array>()
  const secrets = createWebDeviceSecrets({
    secrets: {
      read: async (name) => stored.get(name) ?? null,
      write: async (name, value) => {
        if (value) stored.set(name, value)
        else stored.delete(name)
      },
    },
    available,
  })
  return { secrets, stored }
}

describe('web device secrets', () => {
  it('keeps a secret sealed under its own prefix, apart from the browser’s', async () => {
    const { secrets, stored } = setup()
    stored.set('account-key', new Uint8Array(32))
    await secrets.write('buddies.key-change', '{"former":[]}')
    expect(await secrets.read('buddies.key-change')).toBe('{"former":[]}')
    expect([...stored.keys()].sort()).toEqual([
      'account-key',
      `${WEB_DEVICE_SECRET_PREFIX}buddies.key-change`,
    ])
    expect(await secrets.read('account-key')).toBeNull()
  })

  it('removes a secret', async () => {
    const { secrets, stored } = setup()
    await secrets.write('account-key-history', 'history')
    await secrets.remove('account-key-history')
    expect(await secrets.read('account-key-history')).toBeNull()
    expect(stored.size).toBe(0)
  })

  it('refuses names the native module refuses', async () => {
    const { secrets } = setup()
    await expect(secrets.write('Bad Name', 'x')).rejects.toThrow(
      'Invalid device secret name'
    )
  })

  it('without sealing, reads nothing and refuses to write', async () => {
    const { secrets } = setup(false)
    expect(secrets.isAvailable()).toBe(false)
    expect(await secrets.read('buddies.key-change')).toBeNull()
    await expect(secrets.write('buddies.key-change', 'x')).rejects.toThrow()
    await expect(secrets.remove('buddies.key-change')).resolves.toBeUndefined()
  })
})
