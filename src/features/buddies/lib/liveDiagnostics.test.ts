import { describe, expect, it } from 'vitest'
import {
  applyLiveEvent,
  initialLiveDiagnostics,
  LIVE_LOG_LIMIT,
  type LiveDiagnostics,
} from '@/features/buddies/lib/liveDiagnostics'
import type { LiveEvent } from '@/features/buddies/lib/liveInbox'

const fold = (events: LiveEvent[], start = 1000) =>
  events.reduce<LiveDiagnostics>(
    (state, event, i) => applyLiveEvent(state, event, start + i),
    initialLiveDiagnostics
  )

describe('applyLiveEvent', () => {
  it('tracks status, the latest signals, and counts', () => {
    const state = fold([
      { type: 'connecting' },
      { type: 'open' },
      { type: 'hello', seq: 4, behind: false },
      { type: 'changed', seq: 5 },
      { type: 'sync' },
      { type: 'pong', rttMs: 31 },
      { type: 'closed', code: 1006 },
      { type: 'reconnectScheduled', inMs: 1000, attempt: 1 },
    ])

    expect(state).toMatchObject({
      status: 'reconnecting',
      since: 1007,
      lastHelloSeq: 4,
      lastChangedSeq: 5,
      lastPongRttMs: 31,
      lastClose: { code: 1006, at: 1006 },
      counts: { connects: 1, opens: 1, changes: 1, syncs: 1, closes: 1 },
    })
  })

  it('keeps `since` while the status holds', () => {
    const state = fold([
      { type: 'open' },
      { type: 'changed', seq: 1 },
      { type: 'changed', seq: 2 },
    ])
    expect(state.since).toBe(1000)
  })

  it('keeps only the latest log entries', () => {
    const events = Array.from(
      { length: LIVE_LOG_LIMIT + 5 },
      (_, seq): LiveEvent => ({ type: 'changed', seq })
    )
    const state = fold(events)
    expect(state.log).toHaveLength(LIVE_LOG_LIMIT)
    expect(state.log.at(-1)?.event).toEqual({
      type: 'changed',
      seq: LIVE_LOG_LIMIT + 4,
    })
  })
})
