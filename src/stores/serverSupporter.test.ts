import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/mmkv', () => {
  const values = new Map<string, string>()
  return {
    mmkvStorage: {
      getString: (key: string) => values.get(key),
      set: (key: string, value: string) => void values.set(key, value),
      delete: (key: string) => void values.delete(key),
    },
  }
})

const load = () => import('@/stores/serverSupporter')

describe('the stored server answer', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('ends on time and says so, so it can be read again', async () => {
    const store = await load()
    const expired = vi.fn()
    store.onServerSupporterExpired(expired)
    store.setServerSupporterEntry({
      account: 'a',
      supporter: true,
      expiresAt: 1_000_000 + 5_000,
      readAt: 1_000_000,
    })
    expect(store.useServerSupporter.getState().active).toBe(true)

    vi.advanceTimersByTime(4_999)
    expect(expired).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(store.useServerSupporter.getState().active).toBe(false)
    expect(expired).toHaveBeenCalledOnce()
  })

  it("doesn't report an end for an answer that has none, or that was replaced", async () => {
    const store = await load()
    const expired = vi.fn()
    const off = store.onServerSupporterExpired(expired)
    store.setServerSupporterEntry({
      account: 'a',
      supporter: true,
      expiresAt: 1_000_000 + 5_000,
      readAt: 1_000_000,
    })
    store.setServerSupporterEntry({
      account: 'a',
      supporter: true,
      expiresAt: null,
      readAt: 1_000_000,
    })
    vi.advanceTimersByTime(60_000)
    expect(expired).not.toHaveBeenCalled()
    expect(store.useServerSupporter.getState().active).toBe(true)
    off()
  })

  it('waits out an end beyond the longest timer before reporting it', async () => {
    const store = await load()
    const expired = vi.fn()
    store.onServerSupporterExpired(expired)
    const far = 2 ** 31 + 10_000
    store.setServerSupporterEntry({
      account: 'a',
      supporter: true,
      expiresAt: 1_000_000 + far,
      readAt: 1_000_000,
    })
    vi.advanceTimersByTime(2 ** 31 - 1)
    expect(expired).not.toHaveBeenCalled()
    vi.advanceTimersByTime(far)
    expect(expired).toHaveBeenCalledOnce()
  })
})
