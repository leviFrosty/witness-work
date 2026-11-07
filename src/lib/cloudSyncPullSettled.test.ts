import { beforeEach, describe, expect, it, vi } from 'vitest'

type Settled = typeof import('@/lib/cloudSyncPullSettled')
let settled: Settled

beforeEach(async () => {
  vi.resetModules()
  settled = await import('@/lib/cloudSyncPullSettled')
})

describe('cloudSyncPullSettled', () => {
  it('starts unset each launch', () => {
    expect(settled.completedPullThisLaunch()).toBe(false)
  })

  it('is set by a complete pull, and tells its listeners every time', () => {
    const listener = vi.fn()
    settled.onCompletedPull(listener)
    settled.markCompletePull()
    expect(settled.completedPullThisLaunch()).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    settled.markCompletePull()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('is cleared when the account changes, and its listeners hear it', () => {
    settled.markCompletePull()
    const listener = vi.fn(() => settled.completedPullThisLaunch())
    settled.onCompletedPull(listener)
    settled.resetCompletePull()
    expect(settled.completedPullThisLaunch()).toBe(false)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveLastReturnedWith(false)

    settled.resetCompletePull()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('ignores a pull that started before the account changed', () => {
    const startedIn = settled.completePullGeneration()
    settled.resetCompletePull()
    settled.markCompletePull(startedIn)
    expect(settled.completedPullThisLaunch()).toBe(false)
    settled.markCompletePull(settled.completePullGeneration())
    expect(settled.completedPullThisLaunch()).toBe(true)
  })

  it('stops calling a listener once it unsubscribes', () => {
    const listener = vi.fn()
    const unsubscribe = settled.onCompletedPull(listener)
    unsubscribe()
    settled.markCompletePull()
    expect(listener).not.toHaveBeenCalled()
  })
})
