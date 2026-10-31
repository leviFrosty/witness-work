import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { webcrypto } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createSecureKv } from '@/lib/webStorage/secureKv'

describe('secureKv', () => {
  it('keeps structured values across sessions without turning them into strings', async () => {
    const factory = new IDBFactory()
    const first = createSecureKv({ indexedDB: factory })
    const record = {
      id: 's1',
      expiresAt: new Date(5),
      bytes: new Uint8Array([7]),
    }
    await first.set('session', record)
    first.close()

    const second = createSecureKv({ indexedDB: factory })
    const read = await second.get<typeof record>('session')
    expect(read).toEqual(record)
    expect(read?.expiresAt).toBeInstanceOf(Date)
    expect(read?.bytes).toBeInstanceOf(Uint8Array)
    expect(await second.get('missing')).toBeUndefined()
    second.close()
  })

  it('stores a non-extractable CryptoKey that still works after a reload', async () => {
    const factory = new IDBFactory()
    const key = await webcrypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    )
    const iv = new Uint8Array(12)
    const sealed = await webcrypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode('hello')
    )
    const first = createSecureKv({ indexedDB: factory })
    await first.set('wrapKey', key)
    first.close()

    const second = createSecureKv({ indexedDB: factory })
    const read = await second.get<CryptoKey>('wrapKey')
    expect(read?.extractable).toBe(false)
    await expect(webcrypto.subtle.exportKey('raw', read!)).rejects.toThrow()
    const opened = await webcrypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      read!,
      sealed
    )
    expect(new TextDecoder().decode(opened)).toBe('hello')
    second.close()
  })

  it('deletes one key, and clears them all', async () => {
    const kv = createSecureKv({ indexedDB: new IDBFactory() })
    await kv.set('a', 1)
    await kv.set('b', 2)
    await kv.delete('a')
    expect(await kv.get('a')).toBeUndefined()
    expect(await kv.get('b')).toBe(2)
    await kv.clearAll()
    expect(await kv.get('b')).toBeUndefined()
    kv.close()
  })

  it('rejects values that can’t be cloned instead of saving something else', async () => {
    const kv = createSecureKv({ indexedDB: new IDBFactory() })
    await expect(kv.set('fn', () => 1)).rejects.toThrow()
    kv.close()
  })

  it('is unavailable where there is no IndexedDB, as on iOS and Android', async () => {
    const kv = createSecureKv({ indexedDB: undefined })
    expect(kv.available).toBe(false)
    await expect(kv.get('a')).rejects.toThrow(/web/)
  })

  it('opens again after a newer version closed its connection', async () => {
    const factory = new IDBFactory()
    const kv = createSecureKv({ indexedDB: factory })
    await kv.set('a', 1)
    await new Promise<void>((resolve, reject) => {
      const request = factory.open('witnesswork-keys', 2)
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
    // This version's code can't open version 2; it reports that clearly.
    await expect(kv.get('a')).rejects.toThrow()
    kv.close()
  })
})
