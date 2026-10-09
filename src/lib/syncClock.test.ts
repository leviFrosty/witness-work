import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('sync clock', () => {
  it('corrects a future device clock and keeps time advancing after a wall-clock change', async () => {
    vi.useFakeTimers()
    const trusted = Date.UTC(2026, 8, 30)
    vi.setSystemTime(trusted + 365 * 24 * 60 * 60_000)
    let elapsed = 0
    vi.stubGlobal('performance', { now: () => elapsed })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => new Date(trusted).toUTCString() },
      }))
    )
    const clock = await import('@/lib/syncClock')
    const beforeCalibration = clock.syncTimestamp()
    expect(await clock.refreshSyncClock()).toBe(-365 * 24 * 60 * 60_000)
    expect(clock.syncNow()).toBe(trusted)
    expect(clock.correctedSyncTimestamp(beforeCalibration)).toBe(trusted)
    elapsed += 1000
    vi.setSystemTime(0)
    expect(clock.syncNow()).toBe(trusted + 1000)
    expect(clock.syncTimestamp(trusted + 2000)).toBe(trusted + 2001)
  })
  it('uses the cached offset offline and advances an edited record past its old stamp', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      })
    )
    const clock = await import('@/lib/syncClock')
    clock.setSyncClockOffset(10_000, true)
    expect(await clock.refreshSyncClock()).toBeNull()
    expect(clock.syncNow()).toBe(11_000)
    expect(clock.hasCalibratedSyncClock()).toBe(true)
    expect(clock.syncTimestamp(12_000)).toBe(12_001)
  })
  it('bounds a stalled calibration instead of blocking sync indefinitely', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, init) =>
          new Promise((_resolve, reject) =>
            init.signal.addEventListener('abort', () =>
              reject(new Error('aborted'))
            )
          )
      )
    )
    const clock = await import('@/lib/syncClock')
    const refresh = clock.refreshSyncClock()
    await vi.advanceTimersByTimeAsync(3000)
    expect(await refresh).toBeNull()
  })
  it('backs off after failed calibrations instead of retrying every push', async () => {
    let elapsed = 0
    vi.stubGlobal('performance', { now: () => elapsed })
    const fetch = vi.fn(async () => {
      throw new Error('Network request failed')
    })
    vi.stubGlobal('fetch', fetch)
    const clock = await import('@/lib/syncClock')
    expect(await clock.refreshSyncClock()).toBeNull()
    expect(await clock.refreshSyncClock()).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
    elapsed += clock.calibrationBackoffMs(1)
    expect(await clock.refreshSyncClock()).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(2)
    // The second failure waits twice as long.
    elapsed += clock.calibrationBackoffMs(1)
    await clock.refreshSyncClock()
    expect(fetch).toHaveBeenCalledTimes(2)
    elapsed += clock.calibrationBackoffMs(1)
    await clock.refreshSyncClock()
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(clock.calibrationBackoffMs(20)).toBe(60 * 60_000)
  })
})
