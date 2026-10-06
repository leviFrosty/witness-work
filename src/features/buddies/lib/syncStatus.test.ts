import { describe, expect, it, vi } from 'vitest'
import { createStore } from 'zustand/vanilla'
import {
  buddiesSyncNotice,
  initialBuddySyncStatus,
  settledSyncStatus,
  syncReadInbox,
  trackSync,
  type BuddySyncFailureReason,
  type BuddySyncStatus,
} from '@/features/buddies/lib/syncStatus'

class Failure extends Error {
  constructor(readonly reason: BuddySyncFailureReason) {
    super(reason)
  }
}

function harness() {
  let clock = 1000
  let lastSyncAt = 0
  const store = createStore<BuddySyncStatus>(() => initialBuddySyncStatus)
  const deps = {
    update: (change: (status: BuddySyncStatus) => BuddySyncStatus) =>
      store.setState(change),
    lastSyncAt: () => lastSyncAt,
    now: () => clock,
    failureReason: (error: unknown) =>
      error instanceof Failure ? error.reason : 'error',
  }
  return {
    store,
    track: (sync: () => Promise<void>) => trackSync(sync, deps),
    tick: (ms = 1) => (clock += ms),
    readInbox: () => (lastSyncAt = clock),
  }
}

describe('trackSync', () => {
  it('counts syncs in flight and returns their result', async () => {
    const { store, track } = harness()
    let finish!: () => void
    const running = track(() => new Promise<void>((r) => (finish = r)))
    const second = track(async () => {})
    expect(store.getState().syncing).toBe(2)
    await second
    expect(store.getState().syncing).toBe(1)
    finish()
    await expect(running).resolves.toBeUndefined()
    expect(store.getState()).toEqual(initialBuddySyncStatus)
  })

  it('records why a sync failed and still rethrows', async () => {
    const { store, track, tick } = harness()
    const error = new Failure('offline')
    await expect(
      track(async () => {
        tick()
        throw error
      })
    ).rejects.toBe(error)
    expect(store.getState()).toEqual({
      syncing: 0,
      failure: { reason: 'offline', at: 1001 },
      relayDisabled: false,
    })
  })

  it('counts a sync that read the inbox before failing as a success', async () => {
    const { store, track, tick, readInbox } = harness()
    await expect(
      track(() => Promise.reject(new Failure('error')))
    ).rejects.toThrow()
    expect(store.getState().failure).not.toBeNull()
    await expect(
      track(async () => {
        tick()
        readInbox()
        tick()
        throw new Failure('rate_limited')
      })
    ).rejects.toThrow()
    expect(store.getState()).toEqual(initialBuddySyncStatus)
  })

  it('keeps the kill switch on through other failures until a sync works', async () => {
    const { store, track } = harness()
    await expect(
      track(() => Promise.reject(new Failure('disabled')))
    ).rejects.toThrow()
    expect(store.getState().relayDisabled).toBe(true)
    await expect(
      track(() => Promise.reject(new Failure('offline')))
    ).rejects.toThrow()
    expect(store.getState()).toMatchObject({
      relayDisabled: true,
      failure: { reason: 'offline' },
    })
    await track(async () => {})
    expect(store.getState().relayDisabled).toBe(false)
  })

  it('reads the failure reason only for failures', async () => {
    const failureReason = vi.fn(() => 'error' as const)
    await trackSync(async () => {}, {
      update: () => {},
      lastSyncAt: () => 0,
      now: () => 1,
      failureReason,
    })
    expect(failureReason).not.toHaveBeenCalled()
  })
})

describe('syncReadInbox', () => {
  it('needs the inbox read at or after the sync started', () => {
    expect(syncReadInbox(10, 10)).toBe(true)
    expect(syncReadInbox(11, 10)).toBe(true)
    expect(syncReadInbox(9, 10)).toBe(false)
  })
})

describe('settledSyncStatus', () => {
  it('never counts below zero', () => {
    expect(settledSyncStatus(initialBuddySyncStatus, { at: 1 }).syncing).toBe(0)
  })
})

describe('buddiesSyncNotice', () => {
  const failed = (reason: BuddySyncFailureReason, at = 20) => ({
    failure: { reason, at },
    relayDisabled: false,
  })

  it('says nothing while syncs work', () => {
    expect(buddiesSyncNotice(initialBuddySyncStatus, 0)).toBeNull()
  })

  it('says why the latest sync failed', () => {
    expect(buddiesSyncNotice(failed('offline'), 10)).toBe('offline')
    expect(buddiesSyncNotice(failed('disabled'), 10)).toBe('disabled')
    expect(buddiesSyncNotice(failed('rate_limited'), 10)).toBe('error')
    expect(buddiesSyncNotice(failed('error'), 10)).toBe('error')
  })

  it('drops a failure an inbox read has since replaced', () => {
    expect(buddiesSyncNotice(failed('offline', 20), 20)).toBeNull()
  })

  it('keeps saying Buddies is off until a sync works', () => {
    expect(
      buddiesSyncNotice({ ...failed('offline'), relayDisabled: true }, 10)
    ).toBe('disabled')
  })
})
