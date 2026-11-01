import { describe, expect, it } from 'vitest'
import {
  BACKUP_DAILY_MS,
  BACKUP_DEBOUNCE_MS,
  BACKUP_MAX_PENDING_MS,
  BACKUP_MIN_INTERVAL_MS,
  BACKUP_SERVER_CHECK_MS,
  BackupError,
  type BackupFailure,
  type BackupSchedule,
  backupRetryDelayMs,
  createBackupScheduler,
  EMPTY_BACKUP_SCHEDULE,
} from '@/lib/serverAccount/backupScheduler'

const START = 1_760_000_000_000

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

    serverHas: true as boolean | null | 'throws',
    serverChecks: [] as number[],
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
    hasServerCopy: async () => {
      world.serverChecks.push(now)
      if (world.serverHas === 'throws') throw new Error('offline')
      return world.serverHas
    },
    onFailure: (code) => world.failures.push(code),
  })

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

    await t.advance(5 * 60_000)
    t.scheduler.noteChange()
    await t.advance(BACKUP_DEBOUNCE_MS)
    expect(t.world.uploads).toHaveLength(1)
    expect(t.state()).toMatchObject({ pending: false, lastResult: 'unchanged' })

    await t.advance(BACKUP_DAILY_MS)
    expect(t.world.uploads).toHaveLength(2)
    expect(t.world.uploads[1].at - t.world.uploads[0].at).toBe(BACKUP_DAILY_MS)
  })

  it('never puts twice within the server’s minute', async () => {
    const t = setup()
    await t.scheduler.run('enabled', { force: true })
    t.world.data = 'v2'

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

  it('tries again at the next launch after ww-api asked for an update, not on every return', async () => {
    const updated = setup({
      schedule: {
        lastPutAt: START - 60 * 60_000,
        pending: true,
        lastResult: 'failed',
        lastError: 'update',
        failures: 1,
        retryAt: START + BACKUP_DAILY_MS - 60 * 60_000,
      },
    })
    updated.scheduler.onForeground()
    await updated.advance(10_000)
    expect(updated.world.uploads).toEqual([{ at: START + 5_000, data: 'v1' }])
    expect(updated.state()).toMatchObject({ lastError: null, retryAt: null })

    const t = setup({ schedule: { lastPutAt: START - 1_000_000 } })
    t.scheduler.onForeground()
    t.world.fail.push(new BackupError('update'))
    t.scheduler.noteChange()
    await t.advance(BACKUP_DEBOUNCE_MS)
    expect(t.state().lastError).toBe('update')
    t.scheduler.onForeground()
    await t.advance(60 * 60_000)
    expect(t.world.uploads).toEqual([])
    expect(t.state().retryAt).toBe(START + BACKUP_DEBOUNCE_MS + BACKUP_DAILY_MS)
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

  describe('when another device deletes this one’s server copy', () => {
    const uploadedHourAgo = {
      lastPutAt: START - 60 * 60_000,
      lastHash: 'hash:v1',
    }

    it('uploads unchanged data again soon after coming back to the app', async () => {
      const t = setup({ schedule: uploadedHourAgo })
      t.world.serverHas = false
      t.scheduler.onForeground()
      await t.flush()
      await t.advance(10_000)
      expect(t.world.serverChecks).toEqual([START])
      expect(t.world.uploads).toEqual([{ at: START + 5_000, data: 'v1' }])
      expect(t.state()).toMatchObject({
        pending: false,
        lastResult: 'uploaded',
        lastHash: 'hash:v1',
      })
    })

    it('notices while the app stays open', async () => {
      const t = setup({ schedule: uploadedHourAgo })
      t.scheduler.onForeground()
      await t.advance(30 * 60_000)
      expect(t.world.uploads).toEqual([])
      const checks = t.world.serverChecks.length
      t.world.serverHas = false
      await t.advance(2 * BACKUP_SERVER_CHECK_MS)
      expect(t.world.serverChecks.length).toBeGreaterThan(checks)
      expect(t.world.uploads).toHaveLength(1)
    })

    it('notices within 15 minutes while open, even while edits keep re-planning', async () => {
      const t = setup({ schedule: uploadedHourAgo })
      t.scheduler.onForeground()
      await t.advance(60_000)
      t.world.serverHas = false

      for (let minute = 1; minute < 16; minute += 3) {
        t.scheduler.noteChange()
        await t.advance(3 * 60_000)
      }
      expect(t.world.serverChecks).toEqual([
        START,
        START + BACKUP_SERVER_CHECK_MS,
      ])
      expect(t.world.uploads).toEqual([
        { at: START + BACKUP_SERVER_CHECK_MS + 5_000, data: 'v1' },
      ])
    })

    it('checks every 15 minutes while open, and never more often', async () => {
      const t = setup({ schedule: uploadedHourAgo })
      t.scheduler.onForeground()
      await t.advance(2 * 60 * 60_000)
      expect(t.world.serverChecks).toEqual(
        Array.from(
          { length: 9 },
          (_, index) => START + index * BACKUP_SERVER_CHECK_MS
        )
      )

      const u = setup({ schedule: uploadedHourAgo })
      u.scheduler.onForeground()
      await u.advance(10 * 60_000)
      u.scheduler.serverCopyListed(true, u.now())
      await u.advance(BACKUP_SERVER_CHECK_MS)
      expect(u.world.serverChecks).toEqual([
        START,
        START + 10 * 60_000 + BACKUP_SERVER_CHECK_MS,
      ])
    })

    it('pauses checks in the background, and an inactive blip doesn’t', async () => {
      const t = setup({ schedule: uploadedHourAgo })
      t.scheduler.onForeground()
      await t.flush()
      t.scheduler.onBackground()
      await t.advance(60 * 60_000)
      expect(t.world.serverChecks).toEqual([START])
      t.scheduler.onForeground()
      await t.flush()
      expect(t.world.serverChecks).toEqual([START, START + 60 * 60_000])

      t.scheduler.onInactive()
      await t.advance(BACKUP_SERVER_CHECK_MS)
      expect(t.world.serverChecks).toHaveLength(3)
    })

    it('starts checking after the first upload', async () => {
      const t = setup()
      t.scheduler.onForeground()
      await t.scheduler.run('enabled', { force: true })
      t.world.serverHas = false
      await t.advance(BACKUP_SERVER_CHECK_MS)
      expect(t.world.serverChecks).toEqual([START + BACKUP_SERVER_CHECK_MS])
      expect(t.world.uploads).toHaveLength(1)
      await t.advance(5_000)
      expect(t.world.uploads).toHaveLength(2)
    })

    it('lists the slots at most every 15 minutes', async () => {
      const t = setup({ schedule: uploadedHourAgo })
      t.scheduler.onForeground()
      await t.advance(60_000)
      t.scheduler.onForeground()
      await t.advance(60_000)
      expect(t.world.serverChecks).toEqual([START])
      await t.advance(BACKUP_SERVER_CHECK_MS)
      t.scheduler.onForeground()
      await t.flush()
      expect(t.world.serverChecks).toHaveLength(2)

      const failing = setup({ schedule: uploadedHourAgo })
      failing.world.serverHas = 'throws'
      failing.scheduler.onForeground()
      failing.scheduler.onForeground()
      await failing.advance(60_000)
      expect(failing.world.serverChecks).toEqual([START])
      expect(failing.state()).toMatchObject({ pending: false })
    })

    it('doesn’t list before the first upload, or while off', async () => {
      const fresh = setup()
      fresh.scheduler.onForeground()
      await fresh.flush()
      expect(fresh.world.serverChecks).toEqual([])
      const off = setup({ enabled: false, schedule: uploadedHourAgo })
      off.scheduler.onForeground()
      await off.advance(BACKUP_SERVER_CHECK_MS * 2)
      expect(off.world.serverChecks).toEqual([])
    })

    it('takes the Account screen’s list, but not one older than the last upload', async () => {
      const t = setup({ schedule: uploadedHourAgo })
      t.scheduler.serverCopyListed(true, START)
      await t.advance(60_000)
      expect(t.world.uploads).toEqual([])

      t.scheduler.serverCopyListed(false, START - 2 * 60 * 60_000)
      await t.advance(60_000)
      expect(t.world.uploads).toEqual([])
      t.scheduler.serverCopyListed(false, t.now())
      await t.advance(10_000)
      expect(t.world.uploads).toHaveLength(1)

      t.scheduler.onForeground()
      await t.flush()
      expect(t.world.serverChecks).toEqual([])
    })

    it('still keeps to the server’s minute', async () => {
      const t = setup()
      await t.scheduler.run('enabled', { force: true })
      t.scheduler.serverCopyListed(false, t.now() + 1)
      await t.advance(BACKUP_MIN_INTERVAL_MS - 1)
      expect(t.world.uploads).toHaveLength(1)
      await t.advance(1)
      expect(t.world.uploads).toHaveLength(2)
    })
  })
})
