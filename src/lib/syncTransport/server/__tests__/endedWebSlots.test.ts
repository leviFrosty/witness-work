import { describe, expect, it } from 'vitest'
import {
  endedWebSlots,
  filenameForSlot,
} from '@/lib/syncTransport/server/serverTransport'
import type { SyncSlot } from '@/lib/syncTransport/server/syncClient'

const slot = (slotId: string, over: Partial<SyncSlot> = {}): SyncSlot => ({
  slotId,
  etag: `etag-${slotId}`,
  size: 10,
  updatedAt: 1_000,
  platform: 'web',
  live: false,
  ended: true,
  ...over,
})

describe('endedWebSlots', () => {
  it('picks exactly the ended browsers’ slots still at the version merged', () => {
    const slots = [
      slot('own'),
      slot('ended-web'),
      slot('live-web', { live: true, ended: false }),
      slot('unknown-web', { live: false, ended: false }),
      slot('ended-ios', { platform: 'ios' }),
      slot('ended-android', { platform: 'android' }),
      slot('ended-dev', { platform: 'dev' }),
      slot('ended-old-server', { platform: null }),
      slot('written-since', { updatedAt: 2_000 }),
      slot('not-merged'),
    ]
    const merged = new Map(
      slots
        .filter((s) => s.slotId !== 'not-merged')
        .map((s) => [filenameForSlot(s.slotId), 1_000])
    )
    expect(endedWebSlots(slots, 'own', merged).map((s) => s.slotId)).toEqual([
      'ended-web',
    ])
  })
})
