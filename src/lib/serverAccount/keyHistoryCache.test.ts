import { describe, expect, it, vi } from 'vitest'
import {
  appendKeyHistory,
  keyHistoryEntry,
  sealKeyHistory,
} from '@/lib/serverAccount/keyHistory'
import { createKeyHistoryCache } from '@/lib/serverAccount/keyHistoryCache'

const K1 = new Uint8Array(32).fill(1)
const K2 = new Uint8Array(32).fill(2)
const ACCOUNT = 'A'.repeat(22)
const history = appendKeyHistory(null, keyHistoryEntry(K1, 0, 10))
const sealed = sealKeyHistory(K2, ACCOUNT, 1, history, new Uint8Array(24))

function setup(answer = { keyEpoch: 1, history: sealed as string | null }) {
  let stored: string | null = null
  const store = {
    read: vi.fn(async () => stored),
    write: vi.fn(async (value: string | null) => {
      stored = value
    }),
  }
  const fetchHistory = vi.fn(async () => answer)
  const cache = createKeyHistoryCache({ store, fetchHistory })
  return { cache, store, fetchHistory, stored: () => stored }
}

describe('key history cache', () => {
  it('has none before it’s read from the server', async () => {
    const { cache } = setup()
    expect(await cache.read(ACCOUNT)).toBeNull()
  })

  it('reads the server’s history with the current key and keeps it', async () => {
    const { cache, store, fetchHistory } = setup()
    expect(await cache.refresh(K2, ACCOUNT)).toEqual(history)
    expect(fetchHistory).toHaveBeenCalledWith(K2)
    expect(await cache.read(ACCOUNT)).toEqual(history)

    // A new launch reads it from this device's store.
    const next = createKeyHistoryCache({ store, fetchHistory })
    expect(await next.read(ACCOUNT)).toEqual(history)
  })

  it('keeps it only for its own account', async () => {
    const { cache } = setup()
    await cache.refresh(K2, ACCOUNT)
    expect(await cache.read('B'.repeat(22))).toBeNull()
  })

  it('keeps an account whose key never changed as having none', async () => {
    const { cache } = setup({ keyEpoch: 0, history: null })
    expect(await cache.refresh(K2, ACCOUNT)).toBeNull()
    expect(await cache.read(ACCOUNT)).toBeNull()
  })

  it('keeps what it had when the server’s history doesn’t open', async () => {
    const { cache } = setup()
    await cache.save(ACCOUNT, history)
    // Sealed under K2; this device holds another key.
    await expect(cache.refresh(K1, ACCOUNT)).rejects.toThrow()
    expect(await cache.read(ACCOUNT)).toEqual(history)
  })

  it('takes the history a key change just sealed, and forgets it', async () => {
    const { cache, stored } = setup()
    await cache.save(ACCOUNT, history)
    expect(stored()).not.toBeNull()
    await cache.clear()
    expect(await cache.read(ACCOUNT)).toBeNull()
    expect(stored()).toBeNull()
  })
})
