import { describe, expect, it, vi } from 'vitest'
import {
  cloudSyncDefaultHeld,
  holdCloudSyncDefault,
  onCloudSyncDefaultReleased,
} from './cloudSyncDefaultHold'

describe('cloudSyncDefaultHold', () => {
  it('is held while the work runs and released after', async () => {
    let seen = false
    await holdCloudSyncDefault(async () => {
      seen = cloudSyncDefaultHeld()
    })
    expect(seen).toBe(true)
    expect(cloudSyncDefaultHeld()).toBe(false)
  })

  it('releases when the work throws, and passes the error on', async () => {
    const released = vi.fn()
    const off = onCloudSyncDefaultReleased(released)
    await expect(
      holdCloudSyncDefault(async () => {
        throw new Error('nope')
      })
    ).rejects.toThrow('nope')
    expect(cloudSyncDefaultHeld()).toBe(false)
    expect(released).toHaveBeenCalledTimes(1)
    off()
  })

  it('stays held until the last of overlapping holds ends', async () => {
    const released = vi.fn()
    const off = onCloudSyncDefaultReleased(released)
    let endFirst = () => {}
    const first = holdCloudSyncDefault(
      () => new Promise<void>((resolve) => (endFirst = resolve))
    )
    await holdCloudSyncDefault(async () => {})
    expect(cloudSyncDefaultHeld()).toBe(true)
    expect(released).not.toHaveBeenCalled()
    endFirst()
    await first
    expect(cloudSyncDefaultHeld()).toBe(false)
    expect(released).toHaveBeenCalledTimes(1)
    off()
  })

  it('stops notifying a listener that unsubscribed', async () => {
    const released = vi.fn()
    onCloudSyncDefaultReleased(released)()
    await holdCloudSyncDefault(async () => {})
    expect(released).not.toHaveBeenCalled()
  })
})
