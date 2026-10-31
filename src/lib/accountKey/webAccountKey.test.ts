import { describe, expect, it, vi } from 'vitest'
import {
  createWebAccountKey,
  WEB_ACCOUNT_KEY_NAME,
} from '@/lib/accountKey/webAccountKey'

const key = (fill: number) => new Uint8Array(32).fill(fill)

function setup(saved: Uint8Array | null = null) {
  const store = new Map<string, Uint8Array>()
  if (saved) store.set(WEB_ACCOUNT_KEY_NAME, saved)
  const secrets = {
    read: vi.fn(async (name: string) => store.get(name) ?? null),
    write: vi.fn(async (name: string, value: Uint8Array | null) => {
      if (value) store.set(name, value)
      else store.delete(name)
    }),
  }
  const accountKey = createWebAccountKey({
    secrets,
    randomBytes: (length) => new Uint8Array(length).fill(9),
    publicKeyOf: (stored) => `pub-${stored[0]}`,
  })
  return { accountKey, secrets, store }
}

describe('web account key', () => {
  it('is null until loaded, then answers synchronously', async () => {
    const { accountKey, secrets } = setup(key(1))
    expect(accountKey.current()).toBeNull()
    expect(await accountKey.load()).toEqual(key(1))
    expect(accountKey.current()).toEqual(key(1))
    await accountKey.peek()
    expect(secrets.read).toHaveBeenCalledTimes(1)
  })

  it('seals a key for the next load without loading it or telling listeners', async () => {
    const { accountKey, store } = setup(key(1))
    await accountKey.load()
    const listener = vi.fn()
    accountKey.subscribe(listener)

    await accountKey.seal(key(2))

    expect(store.get(WEB_ACCOUNT_KEY_NAME)).toEqual(key(2))
    expect(accountKey.current()).toBeNull()
    expect(await accountKey.peek()).toBeNull()
    expect(listener).toHaveBeenCalledWith(null)
    expect(listener).not.toHaveBeenCalledWith(key(2))
  })

  it('stores a key that arrived, and tells listeners', async () => {
    const { accountKey, store } = setup()
    const listener = vi.fn()
    accountKey.subscribe(listener)
    await accountKey.save(key(2))
    expect(store.get(WEB_ACCOUNT_KEY_NAME)).toEqual(key(2))
    expect(accountKey.current()).toEqual(key(2))
    expect(listener).toHaveBeenCalledWith(key(2))
    // The same key again changes nothing.
    await accountKey.save(key(2))
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('refuses a key that isn’t 32 bytes', async () => {
    const { accountKey, secrets } = setup()
    await expect(accountKey.save(new Uint8Array(16))).rejects.toThrow()
    expect(secrets.write).not.toHaveBeenCalled()
  })

  it('makes a key for sign-up only when there is none', async () => {
    const { accountKey, store } = setup()
    expect(await accountKey.create()).toEqual(key(9))
    expect(store.get(WEB_ACCOUNT_KEY_NAME)).toEqual(key(9))
    await expect(accountKey.create()).rejects.toThrow(/already/)
  })

  it('forgets the key in memory after a wipe', async () => {
    const { accountKey, store } = setup(key(3))
    await accountKey.load()
    const listener = vi.fn()
    accountKey.subscribe(listener)
    store.clear()
    accountKey.forget()
    expect(accountKey.current()).toBeNull()
    expect(await accountKey.peek()).toBeNull()
    expect(listener).toHaveBeenCalledWith(null)
  })

  it('deletes a retired key alone, and tells listeners', async () => {
    const { accountKey, store } = setup(key(4))
    store.set('session', key(5))
    await accountKey.load()
    const listener = vi.fn()
    accountKey.subscribe(listener)
    expect(await accountKey.retire('pub-4')).toBe(true)
    expect(store.has(WEB_ACCOUNT_KEY_NAME)).toBe(false)
    expect(store.get('session')).toEqual(key(5))
    expect(accountKey.current()).toBeNull()
    expect(await accountKey.peek()).toBeNull()
    expect(listener).toHaveBeenCalledWith(null)
  })

  it('keeps a stored key that isn’t the retired one, whatever is in memory', async () => {
    const { accountKey, store } = setup(key(4))
    await accountKey.load()
    // Another tab stored a newer key since this one loaded.
    store.set(WEB_ACCOUNT_KEY_NAME, key(6))
    expect(await accountKey.retire('pub-4')).toBe(false)
    expect(store.get(WEB_ACCOUNT_KEY_NAME)).toEqual(key(6))
  })
})
