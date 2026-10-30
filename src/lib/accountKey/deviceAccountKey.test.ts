import { describe, expect, it, vi } from 'vitest'
import { toB64u } from '@/lib/bytes'
import {
  AccountKeySignedOutError,
  createDeviceAccountKey,
} from '@/lib/accountKey/deviceAccountKey'
import type { KeyChangeRecord } from '@/lib/accountKey/keyChangeRecord'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'

const K1 = toB64u(new Uint8Array(32).fill(1))
const K2 = toB64u(new Uint8Array(32).fill(2))
const pub = (key: string) =>
  deriveAccountSigningKey(
    Uint8Array.from(
      atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='),
      (c) => c.charCodeAt(0)
    )
  ).publicKey

function setup(
  options: {
    stored?: string | null
    record?: KeyChangeRecord | null
    sharedStore?: boolean
    signedOut?: boolean
  } = {}
) {
  const native = {
    value: options.stored === undefined ? K1 : options.stored,
    peek: vi.fn(async () => native.value),
    getOrCreate: vi.fn(async () => (native.value ??= 'created')),
    replace: vi.fn(async (key: string) => {
      native.value = key
    }),
    remove: vi.fn(async () => {
      native.value = null
    }),
  }
  const retired = new Set<string>()
  const state = {
    record: options.record ?? null,
    signedOut: !!options.signedOut,
  }
  const key = createDeviceAccountKey({
    native,
    record: async () => state.record,
    retired: {
      has: (value) => retired.has(value),
      add: (value) => void retired.add(value),
      delete: (value) => void retired.delete(value),
    },
    sharedStore: options.sharedStore ?? false,
    signedOut: () => state.signedOut,
  })
  return { key, native, retired, state }
}

const record = (stage: KeyChangeRecord['stage']): KeyChangeRecord => ({
  v: 1,
  accountId: 'A'.repeat(22),
  oldKey: K1,
  newKey: K2,
  oldKeyEpoch: 0,
  stage,
  startedAt: 0,
})

describe('device account key', () => {
  it('is the stored key', async () => {
    const { key } = setup()
    expect(await key.peek()).toBe(K1)
    expect(await key.getOrCreate()).toBe(K1)
  })

  it('is the new key once a change committed, whatever the store holds', async () => {
    for (const stage of ['committed', 'stored', 'buddies-reset'] as const) {
      const { key } = setup({ record: record(stage) })
      expect(await key.peek()).toBe(K2)
      expect(await key.getOrCreate()).toBe(K2)
    }
    for (const stage of ['pending', 'confirmed'] as const) {
      const { key } = setup({ record: record(stage) })
      expect(await key.peek()).toBe(K1)
    }
  })

  it('gives no key while the change record can’t be read', async () => {
    const { key, native } = setup()
    const failing = createDeviceAccountKey({
      native,
      record: async () => {
        throw new Error('keystore locked')
      },
      retired: { has: () => false, add: () => {}, delete: () => {} },
      sharedStore: false,
      signedOut: () => false,
    })
    await expect(failing.peek()).rejects.toThrow('keystore locked')
    await expect(failing.getOrCreate()).rejects.toThrow('keystore locked')
    expect(native.getOrCreate).not.toHaveBeenCalled()
    void key
  })

  it('reads a retired key as none, and makes no new one in its place', async () => {
    const { key, native } = setup({ sharedStore: true })
    await key.forgetRetired(pub(K1))
    expect(await key.peek()).toBeNull()
    await expect(key.getOrCreate()).rejects.toBeInstanceOf(
      AccountKeySignedOutError
    )
    expect(native.getOrCreate).not.toHaveBeenCalled()
  })

  it('deletes a retired key it holds alone, only when it is the retired one', async () => {
    const { key, native } = setup()
    await key.forgetRetired(pub(K2))
    expect(native.remove).not.toHaveBeenCalled()
    await key.forgetRetired(pub(K1))
    expect(native.remove).toHaveBeenCalledTimes(1)
    expect(native.value).toBeNull()
  })

  it('never deletes a key the User’s other devices share (iCloud Keychain)', async () => {
    const { key, native } = setup({ sharedStore: true })
    await key.forgetRetired(pub(K1))
    expect(native.remove).not.toHaveBeenCalled()
    expect(await key.peek()).toBeNull()
    // iCloud Keychain brings the new key: it's this device's again.
    native.value = K2
    expect(await key.peek()).toBe(K2)
  })

  it('makes no new key while signed out after a change elsewhere', async () => {
    const { key, native, state } = setup({ stored: null, signedOut: true })
    await expect(key.getOrCreate()).rejects.toBeInstanceOf(
      AccountKeySignedOutError
    )
    expect(native.getOrCreate).not.toHaveBeenCalled()
    state.signedOut = false
    expect(await key.getOrCreate()).toBe('created')
  })

  it('takes back a key it stores again', async () => {
    const { key } = setup()
    await key.forgetRetired(pub(K1))
    await key.replace(K1)
    expect(await key.peek()).toBe(K1)
  })
})
