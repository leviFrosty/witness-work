import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))

import { noteUsage, useScribeUsageStore } from '@/features/scribe/stores/usage'
import type { UsageSnapshotWire } from '@/features/scribe/lib/wire'

const snapshot = (asOf: number, percentUsed: number): UsageSnapshotWire => ({
  plan: 'free',
  supporterCheckFailed: false,
  windows: [{ id: 'monthly', percentUsed, resetsAt: null }],
  limited: false,
  resetsAt: null,
  asOf,
})

describe('noteUsage', () => {
  beforeEach(() => {
    useScribeUsageStore.setState(useScribeUsageStore.getInitialState(), true)
  })

  it('keeps the first snapshot', () => {
    noteUsage(snapshot(100, 10))
    expect(useScribeUsageStore.getState().snapshot).toEqual(snapshot(100, 10))
  })

  it('keeps the newest asOf, whatever order responses arrive in', () => {
    noteUsage(snapshot(200, 30))

    noteUsage(snapshot(150, 20))
    expect(useScribeUsageStore.getState().snapshot?.asOf).toBe(200)
    noteUsage(snapshot(300, 40))
    expect(useScribeUsageStore.getState().snapshot).toEqual(snapshot(300, 40))
  })

  it('takes a snapshot of the same moment', () => {
    noteUsage(snapshot(200, 30))
    noteUsage(snapshot(200, 31))
    expect(
      useScribeUsageStore.getState().snapshot?.windows[0].percentUsed
    ).toBe(31)
  })

  it('ignores a response without one', () => {
    noteUsage(snapshot(200, 30))
    noteUsage(null)
    expect(useScribeUsageStore.getState().snapshot?.asOf).toBe(200)
  })

  it('saves only the snapshot', () => {
    useScribeUsageStore.setState({ loading: true, failed: true, fetchedAt: 5 })
    noteUsage(snapshot(1, 1))
    const partialize = useScribeUsageStore.persist.getOptions().partialize
    expect(partialize?.(useScribeUsageStore.getState())).toEqual({
      snapshot: snapshot(1, 1),
    })
  })
})
