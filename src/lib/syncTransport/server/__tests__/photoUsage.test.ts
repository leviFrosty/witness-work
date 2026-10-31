import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  onPhotoRoom,
  recordPhotoUsage,
  resetPhotoUsage,
  useCloudSyncPhotoUsage,
} from '@/lib/syncTransport/server/photoUsage'

const at = (bytes: number) => ({ bytes, count: 1, limit: 1_000 })

beforeEach(() => resetPhotoUsage())

describe('Cloud Sync photo usage', () => {
  it('retries once when a full account’s usage drops', () => {
    const room = vi.fn()
    const stop = onPhotoRoom(room)
    recordPhotoUsage(at(900), 'full')
    recordPhotoUsage(at(950), 'list')
    expect(room).not.toHaveBeenCalled()
    recordPhotoUsage(at(400), 'delete')
    expect(room).toHaveBeenCalledTimes(1)
    expect(useCloudSyncPhotoUsage.getState().fullAt).toBeNull()
    recordPhotoUsage(at(300), 'delete')
    expect(room).toHaveBeenCalledTimes(1)
    stop()
  })

  it('ends the full state when a photo stores', () => {
    const room = vi.fn()
    const stop = onPhotoRoom(room)
    recordPhotoUsage(at(900), 'full')
    // A raised limit: usage grows, yet the put stored.
    recordPhotoUsage(at(950), 'put')
    expect(useCloudSyncPhotoUsage.getState()).toMatchObject({
      usage: at(950),
      fullAt: null,
    })
    expect(room).not.toHaveBeenCalled()
    stop()
  })
})
