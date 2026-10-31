import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { webcrypto } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { toB64u } from '@/lib/bytes'
import type { KeyChangeRecord } from '@/lib/accountKey/keyChangeRecord'
import { createWebKeyChangeRecordStore } from '@/lib/accountKey/webKeyChangeRecordStore'
import { createSecureKv } from '@/lib/webStorage/secureKv'
import { createSealedSecrets } from '@/lib/webStorage/sealedSecrets'

const K1 = new Uint8Array(32).fill(1)
const K2 = new Uint8Array(32).fill(2)

const record: KeyChangeRecord = {
  v: 1,
  accountId: 'A'.repeat(22),
  oldKey: toB64u(K1),
  newKey: toB64u(K2),
  oldKeyEpoch: 0,
  stage: 'confirmed',
  startedAt: 5,
}

function setup(factory = new IDBFactory()) {
  const kv = createSecureKv({ indexedDB: factory })
  const secrets = createSealedSecrets({
    kv,
    subtle: webcrypto.subtle as SubtleCrypto,
    randomBytes: (length) => webcrypto.getRandomValues(new Uint8Array(length)),
  })
  const store = createWebKeyChangeRecordStore({ secrets, available: true })
  return { kv, secrets, store, factory }
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

describe('web key change record store', () => {
  it('reads back what it wrote, across a reload', async () => {
    const first = setup()
    expect(await first.store.read()).toBeNull()
    await first.store.write(record)
    await first.store.write({
      ...record,
      stage: 'stored',
      reseal: { syncSlots: ['s'], photos: [], backupSlots: ['b'] },
    })
    first.kv.close()

    const second = setup(first.factory)
    expect(await second.store.read()).toEqual({
      ...record,
      stage: 'stored',
      reseal: { syncSlots: ['s'], photos: [], backupSlots: ['b'] },
    })
    await second.store.remove()
    expect(await second.store.read()).toBeNull()
  })

  it('keeps both keys sealed: IndexedDB never holds either in the clear', async () => {
    const { kv, store } = setup()
    await store.write(record)
    const sealed = await kv.get('sealed:account-key-change')
    expect(sealed).toMatchObject({ v: 1 })
    const bytes = bytesOf(sealed)
    const text = new TextEncoder()
    expect(contains(bytes, text.encode(record.oldKey))).toBe(false)
    expect(contains(bytes, text.encode(record.newKey))).toBe(false)
    expect(contains(bytes, K1)).toBe(false)
  })

  it('is kept apart from the account key it changes', async () => {
    const { secrets, store } = setup()
    await secrets.write('account-key', K1)
    await store.write(record)
    await store.remove()
    expect(await secrets.read('account-key')).toEqual(K1)
  })

  it('reads a record it can’t open or parse as none', async () => {
    const { secrets, store } = setup()
    await secrets.write(
      'account-key-change',
      new TextEncoder().encode('{"v":2}')
    )
    expect(await store.read()).toBeNull()
  })

  it('goes with everything else when the browser is wiped', async () => {
    const { secrets, store } = setup()
    await store.write(record)
    await secrets.wipe()
    expect(await store.read()).toBeNull()
  })

  it('says whether the browser can keep one', () => {
    const { secrets } = setup()
    expect(
      createWebKeyChangeRecordStore({ secrets, available: false }).isAvailable()
    ).toBe(false)
    expect(
      createWebKeyChangeRecordStore({ secrets, available: true }).isAvailable()
    ).toBe(true)
  })
})
