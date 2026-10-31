import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { webcrypto } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createSecureKv } from '@/lib/webStorage/secureKv'
import {
  createSealedSecrets,
  SEALED_WRAP_KEY,
} from '@/lib/webStorage/sealedSecrets'

const secret = new Uint8Array(32).map((_, i) => i + 1)

function setup(factory = new IDBFactory()) {
  const kv = createSecureKv({ indexedDB: factory })
  const secrets = createSealedSecrets({
    kv,
    subtle: webcrypto.subtle as SubtleCrypto,
    randomBytes: (length) => webcrypto.getRandomValues(new Uint8Array(length)),
  })
  return { kv, secrets, factory }
}

/** Every byte the database holds for a value, as one array. */
function bytesOf(value: unknown): number[] {
  if (value instanceof ArrayBuffer) return [...new Uint8Array(value)]
  if (ArrayBuffer.isView(value))
    return [...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)]
  if (value && typeof value === 'object')
    return Object.values(value).flatMap(bytesOf)
  return []
}

const contains = (haystack: number[], needle: Uint8Array) =>
  haystack.some((_, start) =>
    needle.every((byte, i) => haystack[start + i] === byte)
  )

describe('sealed secrets', () => {
  it('reads back what it wrote, across a reload', async () => {
    const first = setup()
    await first.secrets.write('account-key', secret)
    first.kv.close()

    const second = setup(first.factory)
    expect(await second.secrets.read('account-key')).toEqual(secret)
    expect(await second.secrets.read('missing')).toBeNull()
  })

  it('keeps only ciphertext, under a wrap key that can’t be exported', async () => {
    const { kv, secrets } = setup()
    await secrets.write('account-key', secret)
    const wrapKey = await kv.get<CryptoKey>(SEALED_WRAP_KEY)
    expect(wrapKey?.extractable).toBe(false)
    expect(wrapKey?.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 })
    await expect(
      webcrypto.subtle.exportKey('raw', wrapKey as webcrypto.CryptoKey)
    ).rejects.toThrow()
    const sealed = await kv.get('sealed:account-key')
    expect(sealed).toMatchObject({ v: 1 })
    expect(contains(bytesOf(sealed), secret)).toBe(false)
  })

  it('uses a fresh nonce for every write', async () => {
    const { kv, secrets } = setup()
    await secrets.write('account-key', secret)
    const first = await kv.get<{ iv: Uint8Array }>('sealed:account-key')
    await secrets.write('account-key', secret)
    const second = await kv.get<{ iv: Uint8Array }>('sealed:account-key')
    expect(first?.iv).not.toEqual(second?.iv)
  })

  it('won’t open a value moved to another name', async () => {
    const { kv, secrets } = setup()
    await secrets.write('account-key', secret)
    await kv.set('sealed:session', await kv.get('sealed:account-key'))
    const onUnreadable = vi.fn()
    const strict = createSealedSecrets({
      kv,
      subtle: webcrypto.subtle as SubtleCrypto,
      randomBytes: (length) =>
        webcrypto.getRandomValues(new Uint8Array(length)),
      onUnreadable,
    })
    expect(await strict.read('session')).toBeNull()
    expect(onUnreadable).toHaveBeenCalledWith('session', expect.anything())
  })

  it('reports a value with a nonce of the wrong length, or no wrap key, as unreadable', async () => {
    const { kv, secrets } = setup()
    await secrets.write('account-key', secret)
    const sealed = await kv.get<{ iv: Uint8Array }>('sealed:account-key')
    await kv.set('sealed:account-key', { ...sealed, iv: new Uint8Array(16) })
    const onUnreadable = vi.fn()
    const decrypt = vi.fn()
    const strict = createSealedSecrets({
      kv,
      subtle: { decrypt } as unknown as SubtleCrypto,
      randomBytes: (length) =>
        webcrypto.getRandomValues(new Uint8Array(length)),
      onUnreadable,
    })
    expect(await strict.read('account-key')).toBeNull()
    expect(decrypt).not.toHaveBeenCalled()
    await kv.delete(SEALED_WRAP_KEY)
    await secrets.write('session', null)
    await kv.set('sealed:session', sealed)
    expect(await strict.read('session')).toBeNull()
    expect(onUnreadable.mock.calls.map(([name]) => name)).toEqual([
      'account-key',
      'session',
    ])
  })

  it('reads nothing once the wrap key is gone', async () => {
    const { kv, secrets, factory } = setup()
    await secrets.write('account-key', secret)
    await kv.delete(SEALED_WRAP_KEY)
    kv.close()
    expect(await setup(factory).secrets.read('account-key')).toBeNull()
  })

  it('deletes one value, and wipes the wrap key with everything', async () => {
    const { kv, secrets } = setup()
    await secrets.write('account-key', secret)
    await secrets.write('session', secret)
    await secrets.write('session', null)
    expect(await secrets.read('session')).toBeNull()
    expect(await secrets.read('account-key')).toEqual(secret)
    await secrets.wipe()
    expect(await kv.get(SEALED_WRAP_KEY)).toBeUndefined()
    expect(await secrets.read('account-key')).toBeNull()
  })

  it('makes a new wrap key after the store was cleared elsewhere', async () => {
    const { kv, secrets, factory } = setup()
    await secrets.write('account-key', secret)
    // `clearAllWebData` clears the store directly.
    await kv.clearAll()
    await secrets.write('account-key', secret)
    kv.close()
    expect(await setup(factory).secrets.read('account-key')).toEqual(secret)
  })

  it('makes one wrap key when two writes race', async () => {
    const { kv, secrets } = setup()
    await Promise.all([secrets.write('a', secret), secrets.write('b', secret)])
    expect(await secrets.read('a')).toEqual(secret)
    expect(await secrets.read('b')).toEqual(secret)
    expect(await kv.get(SEALED_WRAP_KEY)).toBeDefined()
  })
})
