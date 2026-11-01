import { BACKUP_LIMITS } from '@/lib/serverAccount/backupClient'

export const BACKUP_DEBOUNCE_MS = 30_000
export const BACKUP_MAX_PENDING_MS = 5 * 60_000
export const BACKUP_DAILY_MS = 24 * 60 * 60_000

export const BACKUP_MIN_INTERVAL_MS = BACKUP_LIMITS.putIntervalMs + 1_000

export const BACKUP_FOREGROUND_DELAY_MS = 5_000

const MAX_TIMER_MS = 10 * 60_000

export const BACKUP_SERVER_CHECK_MS = 15 * 60_000

export type BackupFailure =
  | 'offline'
  | 'unavailable'
  | 'too_large'
  | 'limit'
  | 'rate_limited'
  | 'key'
  | 'unverified'
  | 'verify_later'
  | 'update'
  | 'server'

export class BackupError extends Error {
  constructor(
    readonly code: BackupFailure,
    readonly retryAfterMs: number | null = null,
    message?: string
  ) {
    super(message ?? `Backup failed: ${code}`)
    this.name = 'BackupError'
  }
}

const PASSING: ReadonlySet<BackupFailure> = new Set([
  'offline',
  'server',
  'rate_limited',
  'verify_later',
])

const SERVER_BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000]

export function backupRetryDelayMs(
  code: BackupFailure,
  failures: number,
  retryAfterMs: number | null = null
): number {
  switch (code) {
    case 'rate_limited':
      return Math.max(retryAfterMs ?? 0, BACKUP_MIN_INTERVAL_MS)
    case 'unavailable':
    case 'limit':
    case 'unverified':
    case 'update':
      return BACKUP_DAILY_MS
    case 'verify_later':
      return 15 * 60_000
    case 'too_large':
      return 6 * 60 * 60_000
    case 'offline':
      return 15 * 60_000
    case 'key':
      return 60 * 60_000
    case 'server':
      return (
        SERVER_BACKOFF_MS[Math.min(failures, SERVER_BACKOFF_MS.length) - 1] ??
        SERVER_BACKOFF_MS[0]
      )
  }
}

export type BackupSchedule = {
  pending: boolean

  lastHash: string | null

  lastPutAt: number | null

  lastSize: number | null
  lastAttemptAt: number | null
  lastResult: 'uploaded' | 'unchanged' | 'failed' | null
  lastError: BackupFailure | null

  failures: number

  retryAt: number | null

  nextAttemptAt: number | null
}

export const EMPTY_BACKUP_SCHEDULE: BackupSchedule = {
  pending: false,
  lastHash: null,
  lastPutAt: null,
  lastSize: null,
  lastAttemptAt: null,
  lastResult: null,
  lastError: null,
  failures: 0,
  retryAt: null,
  nextAttemptAt: null,
}

export type PreparedBackup = {
  hash: string
  upload: () => Promise<{ size: number }>
}

export type BackupRunOutcome =
  | { outcome: 'uploaded'; size: number }
  | { outcome: 'unchanged' }
  | { outcome: 'idle' }
  | { outcome: 'waiting'; until: number }
  | { outcome: 'failed'; code: BackupFailure }

export type BackupSchedulerDeps = {
  now: () => number
  setTimer: (run: () => void, ms: number) => unknown
  clearTimer: (timer: unknown) => void
  isEnabled: () => boolean

  prepare: () => Promise<PreparedBackup>
  state: {
    get: () => BackupSchedule
    set: (patch: Partial<BackupSchedule>) => void
  }

  hasServerCopy?: () => Promise<boolean | null>
  log?: (level: 'info' | 'warn', message: string) => void

  onFailure?: (code: BackupFailure) => void
  onRunningChange?: (running: boolean) => void
}

export type RunOptions = {
  force?: boolean
}

export function createBackupScheduler(deps: BackupSchedulerDeps) {
  let timer: unknown = null
  let inFlight: Promise<BackupRunOutcome> | null = null
  let generation = 0

  let pendingSince: number | null = null

  let serverCheckedAt: number | null = null
  let checkingServer = false

  let checkTimer: unknown = null
  let foreground = false

  let launched = false

  const state = () => deps.state.get()
  const log = (level: 'info' | 'warn', message: string) =>
    deps.log?.(level, message)

  const due = () => {
    const { lastPutAt } = state()
    return lastPutAt === null || deps.now() - lastPutAt >= BACKUP_DAILY_MS
  }

  const notBefore = () => {
    const { lastPutAt, retryAt } = state()
    return Math.max(
      retryAt ?? 0,
      lastPutAt === null ? 0 : lastPutAt + BACKUP_MIN_INTERVAL_MS
    )
  }

  function cancel() {
    if (timer !== null) deps.clearTimer(timer)
    timer = null
  }

  function arm(at: number) {
    cancel()
    deps.state.set({ nextAttemptAt: at })
    const wait = Math.max(0, at - deps.now())
    timer = deps.setTimer(
      () => {
        timer = null
        if (deps.now() < at) arm(at)
        else void run('scheduled')
      },
      Math.min(wait, MAX_TIMER_MS)
    )
  }

  function plan(delayMs: number) {
    if (!deps.isEnabled()) {
      cancel()
      deps.state.set({ nextAttemptAt: null })
      return
    }
    const { pending, lastPutAt } = state()
    if (pending) {
      arm(Math.max(deps.now() + delayMs, notBefore()))
      return
    }

    arm(Math.max(notBefore(), (lastPutAt ?? deps.now()) + BACKUP_DAILY_MS))
  }

  function serverCopyMissing(listedAt: number) {
    if (!deps.isEnabled() || inFlight) return
    const { lastPutAt } = state()
    if (lastPutAt === null || lastPutAt >= listedAt) return
    const now = deps.now()
    pendingSince ??= now
    deps.state.set({ lastHash: null, pending: true })
    log('info', 'server copy missing, uploading again')
    arm(Math.max(now + BACKUP_FOREGROUND_DELAY_MS, notBefore()))
  }

  const checking = () =>
    deps.hasServerCopy !== undefined &&
    deps.isEnabled() &&
    state().lastPutAt !== null

  function cancelCheck() {
    if (checkTimer !== null) deps.clearTimer(checkTimer)
    checkTimer = null
  }

  function armCheck() {
    if (checkTimer !== null) return
    if (!foreground || !checking()) return
    const at = (serverCheckedAt ?? deps.now()) + BACKUP_SERVER_CHECK_MS
    const wait = Math.max(0, at - deps.now())
    checkTimer = deps.setTimer(
      () => {
        checkTimer = null
        void checkServerCopy()
      },
      Math.min(wait, MAX_TIMER_MS)
    )
  }

  async function checkServerCopy() {
    if (checkingServer || !checking()) return
    const now = deps.now()
    if (
      serverCheckedAt !== null &&
      now - serverCheckedAt < BACKUP_SERVER_CHECK_MS
    ) {
      armCheck()
      return
    }
    checkingServer = true
    serverCheckedAt = now
    try {
      if ((await deps.hasServerCopy!()) === false) serverCopyMissing(now)
    } catch {
    } finally {
      checkingServer = false
      armCheck()
    }
  }

  async function attempt(
    reason: string,
    { force = false }: RunOptions
  ): Promise<BackupRunOutcome> {
    if (!deps.isEnabled()) return { outcome: 'idle' }
    const start = deps.now()
    const before = state()
    if (!force) {
      if (!before.pending && !due()) {
        plan(0)
        return { outcome: 'idle' }
      }
      const until = notBefore()
      if (start < until) {
        arm(until)
        return { outcome: 'waiting', until }
      }
    }
    const covering = generation
    deps.onRunningChange?.(true)
    try {
      const prepared = await deps.prepare()
      const now = deps.now()
      const sinceLastPut =
        before.lastPutAt === null ? Infinity : now - before.lastPutAt
      const unchanged =
        prepared.hash === state().lastHash &&
        sinceLastPut < (force ? BACKUP_MIN_INTERVAL_MS : BACKUP_DAILY_MS)
      if (unchanged) {
        const covered = covering === generation
        if (covered) pendingSince = null
        deps.state.set({
          pending: !covered,
          lastAttemptAt: now,
          lastResult: 'unchanged',
          lastError: null,
          failures: 0,
          retryAt: null,
        })
        log('info', `${reason}: unchanged, not uploaded`)
        plan(BACKUP_DEBOUNCE_MS)
        return { outcome: 'unchanged' }
      }
      if (sinceLastPut < BACKUP_MIN_INTERVAL_MS) {
        const until = (before.lastPutAt ?? now) + BACKUP_MIN_INTERVAL_MS
        deps.state.set({ pending: true })
        arm(until)
        log('info', `${reason}: waiting for the server's minute`)
        return { outcome: 'waiting', until }
      }
      const { size } = await prepared.upload()
      const done = deps.now()
      const covered = covering === generation
      if (covered) pendingSince = null
      deps.state.set({
        pending: !covered,
        lastHash: prepared.hash,
        lastPutAt: done,
        lastSize: size,
        lastAttemptAt: done,
        lastResult: 'uploaded',
        lastError: null,
        failures: 0,
        retryAt: null,
      })
      log('info', `${reason}: uploaded ${size} bytes`)
      plan(BACKUP_DEBOUNCE_MS)

      serverCheckedAt = done
      armCheck()
      return { outcome: 'uploaded', size }
    } catch (error) {
      const failure =
        error instanceof BackupError ? error : new BackupError('server')
      const failures = state().failures + 1
      const now = deps.now()
      const retryAt =
        now +
        backupRetryDelayMs(failure.code, failures, failure.retryAfterMs ?? null)
      deps.state.set({
        pending: true,
        lastAttemptAt: now,
        lastResult: 'failed',
        lastError: failure.code,
        failures,
        retryAt,
      })
      log('warn', `${reason}: failed (${failure.code})`)
      deps.onFailure?.(failure.code)
      if (deps.isEnabled()) arm(retryAt)
      return { outcome: 'failed', code: failure.code }
    } finally {
      deps.onRunningChange?.(false)
    }
  }

  function run(
    reason: string,
    options: RunOptions = {}
  ): Promise<BackupRunOutcome> {
    if (inFlight) return inFlight
    inFlight = attempt(reason, options).finally(() => {
      inFlight = null
    })
    return inFlight
  }

  function uploadPending() {
    if (!deps.isEnabled() || !state().pending) return
    if (deps.now() >= notBefore()) void run('background')
  }

  return {
    run,

    noteChange() {
      generation++
      if (!deps.isEnabled()) return
      const now = deps.now()
      pendingSince ??= now
      if (!state().pending) deps.state.set({ pending: true })
      if (inFlight) return
      const latest = pendingSince + BACKUP_MAX_PENDING_MS
      arm(Math.max(Math.min(now + BACKUP_DEBOUNCE_MS, latest), notBefore()))
    },

    onInactive: uploadPending,

    onBackground() {
      foreground = false
      cancelCheck()
      uploadPending()
    },

    onForeground() {
      foreground = true

      const launching = !launched
      launched = true
      if (!deps.isEnabled()) return
      const { lastError } = state()
      if (
        lastError &&
        (PASSING.has(lastError) || (lastError === 'update' && launching))
      )
        deps.state.set({ retryAt: null, failures: 0 })
      if (state().pending || due()) plan(BACKUP_FOREGROUND_DELAY_MS)
      else plan(0)
      void checkServerCopy()
    },

    onReconnect() {
      if (!deps.isEnabled() || state().lastError !== 'offline') return
      deps.state.set({ retryAt: null })
      plan(BACKUP_FOREGROUND_DELAY_MS)
    },

    serverCopyListed(present: boolean, listedAt: number) {
      serverCheckedAt = deps.now()
      if (!present) serverCopyMissing(listedAt)
      armCheck()
    },

    stop() {
      cancel()
      cancelCheck()
      pendingSince = null
      deps.state.set({ nextAttemptAt: null, retryAt: null })
    },
    isRunning: () => inFlight !== null,
  }
}

export type BackupScheduler = ReturnType<typeof createBackupScheduler>
