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

  it('deletes the key a sign-up made when no account came of it', async () => {
    const { accountKey, store } = setup()
    const made = await accountKey.create()
    await accountKey.discard(made)
    expect(store.has(WEB_ACCOUNT_KEY_NAME)).toBe(false)
    expect(accountKey.current()).toBeNull()
    // A new sign-up can make another.
    expect(await accountKey.create()).toEqual(key(9))
  })

  it('never deletes a key other than the one it was told to', async () => {
    const { accountKey, store } = setup(key(3))
    await accountKey.discard(key(9))
    expect(store.get(WEB_ACCOUNT_KEY_NAME)).toEqual(key(3))
    expect(accountKey.current()).toEqual(key(3))
  })

  describe('beside another tab', () => {
    /** Two tabs of one browser: one store, a memory each. */
    function twoTabs() {
      const one = setup()
      const two = createWebAccountKey({
        secrets: one.secrets,
        randomBytes: (length) => new Uint8Array(length).fill(7),
      })
      return { one: one.accountKey, two, store: one.store }
    }

    it('reads the stored key, not the memory from launch', async () => {
      const { one, two } = twoTabs()
      await two.load()
      const made = await one.create()
      expect(await two.peek()).toBeNull()
      expect(await two.readStored()).toEqual(made)
    })

    it('never makes a key over one another tab stored', async () => {
      const { one, two, store } = twoTabs()
      await two.load()
      const made = await one.create()
      await expect(two.create()).rejects.toThrow(/already/)
      expect(store.get(WEB_ACCOUNT_KEY_NAME)).toEqual(made)
    })

    it('deletes only the key that is stored, whatever memory holds', async () => {
      const { one, two, store } = twoTabs()
      const first = await one.create()
      await two.load()
      // Tab one's key is replaced in storage behind tab two's memory.
      await one.discard(first)
      store.set(WEB_ACCOUNT_KEY_NAME, key(5))
      await two.discard(first)
      expect(store.get(WEB_ACCOUNT_KEY_NAME)).toEqual(key(5))
      expect(two.current()).toBeNull()
    })

    it('throws when storage can’t be read, instead of answering none', async () => {
      const { accountKey, secrets } = setup(key(3))
      secrets.read.mockRejectedValueOnce(new Error('blocked'))
      await expect(accountKey.readStored()).rejects.toThrow('blocked')
    })
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
})
