import { beforeEach, describe, expect, it, vi } from 'vitest'

const storage = vi.hoisted(() => new Map<string, boolean>())
vi.mock('@/stores/mmkv', () => ({
  mmkvStorage: {
    getBoolean: (key: string) => storage.get(key),
    set: (key: string, value: boolean) => storage.set(key, value),
  },
}))

const load = async () => {
  vi.resetModules()
  return (await import('@/stores/supporterStatus')).useSupporter
}

describe('supporter status cache', () => {
  beforeEach(() => storage.clear())

  it('starts as not a supporter when nothing is cached', async () => {
    const useSupporter = await load()
    expect(useSupporter.getState().isSupporter).toBe(false)
  })

  it('starts from the last status RevenueCat reported', async () => {
    storage.set('supporter.lastKnown', true)
    const useSupporter = await load()
    expect(useSupporter.getState().isSupporter).toBe(true)
  })

  it('lets a fresh answer overwrite the cached one', async () => {
    storage.set('supporter.lastKnown', true)
    const useSupporter = await load()
    useSupporter.getState().setSupporter(false)
    expect(useSupporter.getState().isSupporter).toBe(false)
    expect(storage.get('supporter.lastKnown')).toBe(false)
  })

  it("doesn't notify when the answer matches the cache", async () => {
    storage.set('supporter.lastKnown', true)
    const useSupporter = await load()
    const listener = vi.fn()
    useSupporter.subscribe(listener)
    useSupporter.getState().setSupporter(true)
    expect(listener).not.toHaveBeenCalled()
  })
})
