import { describe, expect, it } from 'vitest'
import {
  SYNC_IMPORT_DEADLINE_MS,
  SYNC_SLOT_MAX_AGE_MS,
  decideAcquire,
  decideStartOutcome,
} from './cap'
import type { ImportStatus } from './events'

describe('decideAcquire', () => {
  it('grants a new import while under the cap', () => {
    expect(decideAcquire(0, false, 2)).toBe(true)
    expect(decideAcquire(1, false, 2)).toBe(true)
  })

  it('denies a new import at or over the cap', () => {
    expect(decideAcquire(2, false, 2)).toBe(false)
    expect(decideAcquire(5, false, 2)).toBe(false)
  })

  it('is idempotent: an already-held id is always granted, even at cap', () => {
    expect(decideAcquire(2, true, 2)).toBe(true)
    expect(decideAcquire(5, true, 2)).toBe(true)
  })
})

describe('decideStartOutcome', () => {
  it("'started' for a fresh run (no prior status) — slot legitimately consumed", () => {
    expect(decideStartOutcome(null)).toBe('started')
  })

  it("'started' for a restart after a failure ('error') — slot re-used, not leaked", () => {
    // 'error' re-kicks actually reschedule the model, so the re-acquired slot is
    // used, not orphaned. Must NOT be released.
    expect(decideStartOutcome('error')).toBe('started')
  })

  it("'running' for every live re-kick — index row still held, acquire was a no-op", () => {
    const live: ImportStatus[] = [
      'queued',
      'starting',
      'thinking',
      'structuring',
    ]
    for (const status of live) {
      expect(decideStartOutcome(status)).toBe('running')
    }
  })

  it("'terminal' for a settled re-kick ('done'/'cancelled') — acquire re-inserted an ORPHAN row to release", () => {
    // These are the leak path: start() no-ops (reconnect to the cached result),
    // but the slot was already released when the run first settled, so the
    // kickoff's acquire re-inserted an orphan row that must be released.
    expect(decideStartOutcome('done')).toBe('terminal')
    expect(decideStartOutcome('cancelled')).toBe('terminal')
  })

  it('only the terminal outcome demands a release (the leak-fix invariant)', () => {
    const all: (ImportStatus | null)[] = [
      null,
      'queued',
      'starting',
      'thinking',
      'structuring',
      'done',
      'error',
      'cancelled',
    ]
    const releasable = all.filter(
      (s) => decideStartOutcome(s) === 'terminal'
    )
    expect(releasable).toEqual(['done', 'cancelled'])
  })
})

describe('synchronous slot lifetime and model deadline', () => {
  it('ends the model call minutes before its slot could age out', () => {
    expect(SYNC_IMPORT_DEADLINE_MS).toBeLessThan(SYNC_SLOT_MAX_AGE_MS)
    // Room for settlement and the response after a call that ran to the end.
    expect(SYNC_SLOT_MAX_AGE_MS - SYNC_IMPORT_DEADLINE_MS).toBeGreaterThanOrEqual(
      5 * 60 * 1000
    )
    // Still far beyond a real model run (about a minute).
    expect(SYNC_IMPORT_DEADLINE_MS).toBeGreaterThanOrEqual(5 * 60 * 1000)
  })
})
