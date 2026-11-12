import { describe, expect, it } from 'vitest'
import {
  clockOffset,
  IDLE_AFTER_MS,
  nextStamp,
  POLL_ACTIVE_MS,
  POLL_IDLE_MS,
  pollDelay,
} from '@/features/territories/guest/timing'

describe('guest timing', () => {
  it('polls every 15 s while active, every minute when idle, never hidden', () => {
    expect(pollDelay({ visible: true, idleMs: 0 })).toBe(POLL_ACTIVE_MS)
    expect(pollDelay({ visible: true, idleMs: IDLE_AFTER_MS })).toBe(
      POLL_IDLE_MS
    )
    expect(pollDelay({ visible: false, idleMs: 0 })).toBeNull()
  })

  it('corrects the clock only past the Date header’s second', () => {
    expect(clockOffset(10_000, 9_500, 0)).toBe(0)
    expect(clockOffset(10_000, 4_000, 0)).toBe(6_000)
    expect(clockOffset(null, 4_000, 123)).toBe(123)
  })

  it('stamps after every earlier version of the record', () => {
    expect(nextStamp(100.4)).toBe(100)
    expect(nextStamp(100, 150, 90)).toBe(151)
  })
})
