import { describe, expect, it } from 'vitest'
import {
  BACKUP_DAILY_MS,
  BACKUP_DEBOUNCE_MS,
  BACKUP_MAX_PENDING_MS,
  BACKUP_MIN_INTERVAL_MS,
  BackupError,
  type BackupFailure,
  type BackupSchedule,
  backupRetryDelayMs,
  createBackupScheduler,
  EMPTY_BACKUP_SCHEDULE,
} from '@/lib/serverAccount/backupScheduler'

const START = 1_760_000_000_000

/**
 * A scheduler on a fake clock: `advance` fires due timers in order, and each
 * upload is recorded. `data` is what the snapshot hashes; `fail` makes the next
 * uploads throw.
 */
function setup({
  enabled = true,
  schedule = {},
}: { enabled?: boolean; schedule?: Partial<BackupSchedule> } = {}) {
  let now = START
  let nextId = 0
  const timers = new Map<number, { at: number; run: () => void }>()
  let state: BackupSchedule = { ...EMPTY_BACKUP_SCHEDULE, ...schedule }
  const world = {
    enabled,
    data: 'v1',
    fail: [] as BackupError[],
    uploads: [] as { at: number; data: string }[],
    prepares: 0,
    failures: [] as BackupFailure[],
  }
  const scheduler = createBackupScheduler({
    now: () => now,
    setTimer: (run, ms) => {
      const id = ++nextId
      timers.set(id, { at: now + ms, run })
      return id
    },
    clearTimer: (id) => timers.delete(id as number),
    isEnabled: () => world.enabled,
    prepare: async () => {
      world.prepares++
      const data = world.data
      return {
        hash: `hash:${data}`,
        upload: async () => {
          const failure = world.fail.shift()
          if (failure) throw failure
          world.uploads.push({ at: now, data })
          return { size: data.length }
        },
      }
    },
    state: {
      get: () => state,
      set: (patch) => {
        state = { ...state, ...patch }
      },
    },
    onFailure: (code) => world.failures.push(code),
  })
  /** Runs the clock forward, firing timers (and their uploads) as they fall due. */
  const advance = async (ms: number) => {
    const end = now + ms
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      timers.delete(due[0])
      now = Math.max(now, due[1].at)
      due[1].run()
      await flush()
    }
    now = end
    await flush()
  }
  const flush = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve()
  }
  return {
    scheduler,
    world,
    advance,
    flush,
    state: () => state,
    now: () => now,
    timers: () => [...timers.values()].map((timer) => timer.at - now),
  }
}

describe('backup scheduler', () => {
  it('uploads once edits settle, not on every edit', async () => {
    const t = setup({
      schedule: { lastPutAt: START - 1_000_000, lastHash: 'hash:v0' },
    })
    t.scheduler.noteChange()
    await t.advance(10_000)
    t.world.data = 'v2'
    t.scheduler.noteChange()
    await t.advance(BACKUP_DEBOUNCE_MS - 1)
    expect(t.world.uploads).toEqual([])
    await t.advance(1)
    expect(t.world.uploads).toEqual([
      { at: START + 10_000 + BACKUP_DEBOUNCE_MS, data: 'v2' },
    ])
    expect(t.state()).toMatchObject({
      pending: false,
      lastHash: 'hash:v2',
      lastResult: 'uploaded',
      lastSize: 2,
    })
  })

  it('uploads at the latest a few minutes after the first of steady edits', async () => {
    const t = setup({ schedule: { lastPutAt: START - 1_000_000 } })
    for (
      let elapsed = 0;
      elapsed < BACKUP_MAX_PENDING_MS + 60_000;
      elapsed += 10_000
    ) {
      t.scheduler.noteChange()
      await t.advance(10_000)
    }
    expect(t.world.uploads.length).toBeGreaterThanOrEqual(1)
    expect(t.world.uploads[0].at).toBeLessThanOrEqual(
      START + BACKUP_MAX_PENDING_MS
    )
  })

  it('does nothing while off', async () => {
    const t = setup({ enabled: false })
    t.scheduler.noteChange()
    t.scheduler.onForeground()
    t.scheduler.onBackground()
    await t.advance(BACKUP_DAILY_MS * 2)
    expect(t.world.prepares).toBe(0)
    expect(await t.scheduler.run('manual', { force: true })).toEqual({
      outcome: 'idle',
    })
  })

  it('skips an unchanged snapshot within the day, but uploads it daily', async () => {
    const t = setup()
    expect(await t.scheduler.run('enabled', { force: true })).toEqual({
      outcome: 'uploaded',
      size: 2,
    })
    // A change that changes nothing in the payload (a bookkeeping write).
    await t.advance(5 * 60_000)
    t.scheduler.noteChange()
    await t.advance(BACKUP_DEBOUNCE_MS)
    expect(t.world.uploads).toHaveLength(1)
    expect(t.state()).toMatchObject({ pending: false, lastResult: 'unchanged' })
    // The daily upload refreshes the server's 400-day clock.
    await t.advance(BACKUP_DAILY_MS)
    expect(t.world.uploads).toHaveLength(2)
    expect(t.world.uploads[1].at - t.world.uploads[0].at).toBe(BACKUP_DAILY_MS)
  })

  it('never puts twice within the server’s minute', async () => {
    const t = setup()
    await t.scheduler.run('enabled', { force: true })
    t.world.data = 'v2'
    // Back Up Now right after: changed data waits for the minute.
    const result = await t.scheduler.run('manual', { force: true })
    expect(result).toEqual({
      outcome: 'waiting',
      until: START + BACKUP_MIN_INTERVAL_MS,
    })
    expect(t.world.uploads).toHaveLength(1)
    await t.advance(BACKUP_MIN_INTERVAL_MS)
    expect(t.world.uploads).toHaveLength(2)
    expect(t.world.uploads[1]).toEqual({
      at: START + BACKUP_MIN_INTERVAL_MS,
      data: 'v2',
    })
  })

  it('Back Up Now uploads unchanged data too, unless it just did', async () => {
    const t = setup()
    await t.scheduler.run('enabled', { force: true })
    expect(await t.scheduler.run('manual', { force: true })).toEqual({
      outcome: 'unchanged',
    })
    await t.advance(10 * 60_000)
    expect(await t.scheduler.run('manual', { force: true })).toMatchObject({
      outcome: 'uploaded',
    })
    expect(t.world.uploads).toHaveLength(2)
  })

  it('flushes pending edits when the app leaves, without waiting', async () => {
    const t = setup({ schedule: { lastPutAt: START - 1_000_000 } })
    t.world.data = 'v2'
    t.scheduler.noteChange()
    t.scheduler.onBackground()
    await t.flush()
    expect(t.world.uploads).toEqual([{ at: START, data: 'v2' }])
    // Nothing pending: leaving again uploads nothing.
    t.scheduler.onBackground()
    await t.flush()
    expect(t.world.uploads).toHaveLength(1)
  })

  it('covers edits made during an upload with another one', async () => {
    const t = setup({ schedule: { lastPutAt: START - 1_000_000 } })
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const scheduler = t.scheduler
    t.scheduler.noteChange()
    // Hold the first upload open while the User keeps editing.
    const upload = scheduler.run('manual', { force: true })
    t.world.data = 'v2'
    scheduler.noteChange()
    release()
    await gate
    await upload
    expect(t.state().pending).toBe(true)
    await t.advance(BACKUP_MIN_INTERVAL_MS + BACKUP_DEBOUNCE_MS)
    expect(t.world.uploads.map((u) => u.data)).toEqual(['v1', 'v2'])
    expect(t.state().pending).toBe(false)
  })

  it('backs off by reason and keeps the edit pending', async () => {
    const t = setup({ schedule: { lastPutAt: START - 1_000_000 } })
    t.world.fail.push(new BackupError('server'), new BackupError('server'))
    t.scheduler.noteChange()
    await t.advance(BACKUP_DEBOUNCE_MS)
    expect(t.state()).toMatchObject({
      pending: true,
      lastResult: 'failed',
      lastError: 'server',
      failures: 1,
    })
    // Edits meanwhile don't retry early.
    t.scheduler.noteChange()
    await t.advance(BACKUP_DEBOUNCE_MS)
    expect(t.world.uploads).toEqual([])
    await t.advance(60_000)
    expect(t.state().failures).toBe(2)
    await t.advance(5 * 60_000)
    expect(t.world.uploads).toHaveLength(1)
    expect(t.state()).toMatchObject({
      failures: 0,
      lastError: null,
      pending: false,
    })
    expect(t.world.failures).toEqual(['server', 'server'])
  })

  it('honors the server’s retry-after and waits a day while backups are off', () => {
    expect(backupRetryDelayMs('rate_limited', 1, 120_000)).toBe(120_000)
    expect(backupRetryDelayMs('rate_limited', 1, null)).toBe(
      BACKUP_MIN_INTERVAL_MS
    )
    expect(backupRetryDelayMs('unavailable', 1)).toBe(BACKUP_DAILY_MS)
    expect(backupRetryDelayMs('limit', 3)).toBe(BACKUP_DAILY_MS)
    expect(backupRetryDelayMs('server', 1)).toBe(60_000)
    expect(backupRetryDelayMs('server', 99)).toBe(60 * 60_000)
  })

  it('retries an offline failure when the connection returns', async () => {
    const t = setup({ schedule: { lastPutAt: START - 1_000_000 } })
    t.world.fail.push(new BackupError('offline'))
    t.scheduler.noteChange()
    await t.advance(BACKUP_DEBOUNCE_MS)
    expect(t.state().lastError).toBe('offline')
    await t.advance(60_000)
    expect(t.world.uploads).toEqual([])
    t.scheduler.onReconnect()
    await t.advance(10_000)
    expect(t.world.uploads).toHaveLength(1)
  })

  it('coming back to the app retries passing failures, not a full account', async () => {
    const t = setup({ schedule: { lastPutAt: START - 1_000_000 } })
    t.world.fail.push(new BackupError('limit'))
    t.scheduler.noteChange()
    await t.advance(BACKUP_DEBOUNCE_MS)
    t.scheduler.onForeground()
    await t.advance(60 * 60_000)
    expect(t.world.uploads).toEqual([])
    expect(t.state().retryAt).toBe(START + BACKUP_DEBOUNCE_MS + BACKUP_DAILY_MS)

    const u = setup({ schedule: { lastPutAt: START - 1_000_000 } })
    u.world.fail.push(new BackupError('server'), new BackupError('server'))
    u.scheduler.noteChange()
    await u.advance(BACKUP_DEBOUNCE_MS)
    await u.advance(60_000)
    expect(u.state().failures).toBe(2)
    u.scheduler.onForeground()
    await u.advance(10_000)
    expect(u.world.uploads).toHaveLength(1)
  })

  it('catches up on launch when a day has passed, or edits were left pending', async () => {
    const due = setup({
      schedule: { lastPutAt: START - BACKUP_DAILY_MS - 1, lastHash: 'hash:v1' },
    })
    due.scheduler.onForeground()
    await due.advance(10_000)
    expect(due.world.uploads).toHaveLength(1)

    const pending = setup({
      schedule: {
        lastPutAt: START - 60 * 60_000,
        lastHash: 'hash:v0',
        pending: true,
      },
    })
    pending.scheduler.onForeground()
    await pending.advance(10_000)
    expect(pending.world.uploads).toHaveLength(1)

    const current = setup({
      schedule: { lastPutAt: START - 60 * 60_000, lastHash: 'hash:v1' },
    })
    current.scheduler.onForeground()
    await current.advance(10 * 60_000)
    expect(current.world.prepares).toBe(0)
    // Long waits re-check rather than holding a day-long timer.
    expect(Math.max(...current.timers())).toBeLessThanOrEqual(10 * 60_000)
  })

  it('stops planning once turned off', async () => {
    const t = setup({ schedule: { lastPutAt: START - 1_000_000 } })
    t.scheduler.noteChange()
    t.world.enabled = false
    t.scheduler.stop()
    await t.advance(BACKUP_DAILY_MS)
    expect(t.world.prepares).toBe(0)
    expect(t.state().nextAttemptAt).toBeNull()
  })
})
