import { BACKUP_LIMITS } from '@/lib/serverAccount/backupClient'

/**
 * When the end-to-end encrypted backup uploads (ADR 0026 §4). Pure: the clock,
 * timers, what to upload and where its state lives are injected, so the rules
 * are tested without a device.
 *
 * - A change to the data uploads after `DEBOUNCE_MS` of quiet, or
 *   `MAX_PENDING_MS` after the first change while edits keep coming.
 * - Leaving the app uploads at once when anything is pending.
 * - At least once a day while it's on, even unchanged, so the server's 400-day
 *   expiry never reaches a slot in use and "Last backup" stays current.
 * - Never more than one upload a minute (the server refuses more), and an
 *   unchanged snapshot (same hash) isn't uploaded again within the day.
 * - Failures back off by reason; coming back to the app or the connection
 *   returning retries the passing ones (offline, server, rate limited) sooner.
 * - Another device can delete this one's server copy (Delete Backup), which the
 *   hash skip can't see. Coming back to the app lists the slots, and so does a
 *   timer of its own every `SERVER_CHECK_MS` while the app is in the foreground
 *   (never more often, Settings' listings included); a missing slot uploads
 *   again soon. The timer is its own so that uploads, which re-plan the upload
 *   timer on every change, can't keep putting it off.
 */

export const BACKUP_DEBOUNCE_MS = 30_000
export const BACKUP_MAX_PENDING_MS = 5 * 60_000
export const BACKUP_DAILY_MS = 24 * 60 * 60_000
/** The server's one put a slot a minute, with a second's margin. */
export const BACKUP_MIN_INTERVAL_MS = BACKUP_LIMITS.putIntervalMs + 1_000
/** Coming back to the app waits this long, so launch work goes first. */
export const BACKUP_FOREGROUND_DELAY_MS = 5_000
/** Long waits wake at this interval rather than holding one long timer. */
const MAX_TIMER_MS = 10 * 60_000
/** Whether the server still has this device's slot, asked at most this often. */
export const BACKUP_SERVER_CHECK_MS = 15 * 60_000

/** Why an upload failed, as Settings, Tools and analytics name it. */
export type BackupFailure =
  /** No connection, or the request timed out. */
  | 'offline'
  /** Backups or accounts are off on the server (`disabled`). */
  | 'unavailable'
  /** Over 20 MiB (`too_large`). */
  | 'too_large'
  /** The account already has 8 other slots (`limit`). */
  | 'limit'
  /** The server said to wait (`rate_limited`). */
  | 'rate_limited'
  /** The account key couldn't be read or created. */
  | 'key'
  /** This device couldn't prove it's WitnessWork, so it has no session. */
  | 'unverified'
  /** The same, but Apple's or Google's check was only unavailable for now. */
  | 'verify_later'
  /** Ww-api needs a newer app version (426). */
  | 'update'
  /** Anything else the server or the app got wrong. */
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

/** Failures worth trying again as soon as the app or connection comes back. */
const PASSING: ReadonlySet<BackupFailure> = new Set([
  'offline',
  'server',
  'rate_limited',
  'verify_later',
])

const SERVER_BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000]

/** The wait after `failures` failures in a row, the last with `code`. */
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
      // The connection returning retries sooner.
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

/** What the scheduler keeps between launches. */
export type BackupSchedule = {
  /** Data changed since the last upload covered it. */
  pending: boolean
  /** Hash of the last uploaded plaintext (without its timestamps). */
  lastHash: string | null
  /** The last successful upload, on this device's clock. */
  lastPutAt: number | null
  /** Its blob's size. */
  lastSize: number | null
  lastAttemptAt: number | null
  lastResult: 'uploaded' | 'unchanged' | 'failed' | null
  lastError: BackupFailure | null
  /** Failures in a row. */
  failures: number
  /** No automatic attempt before this, after a failure. */
  retryAt: number | null
  /** When the next automatic attempt is planned, for Tools. */
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

/** A snapshot ready to upload: its hash first, so an unchanged one is skipped. */
export type PreparedBackup = {
  hash: string
  upload: () => Promise<{ size: number }>
}

export type BackupRunOutcome =
  | { outcome: 'uploaded'; size: number }
  | { outcome: 'unchanged' }
  /** Off, or nothing pending and not due. */
  | { outcome: 'idle' }
  /** Too soon after the last upload or a failure; it runs at `until`. */
  | { outcome: 'waiting'; until: number }
  | { outcome: 'failed'; code: BackupFailure }

export type BackupSchedulerDeps = {
  now: () => number
  setTimer: (run: () => void, ms: number) => unknown
  clearTimer: (timer: unknown) => void
  isEnabled: () => boolean
  /** Builds and hashes the snapshot. Throws `BackupError`. */
  prepare: () => Promise<PreparedBackup>
  state: {
    get: () => BackupSchedule
    set: (patch: Partial<BackupSchedule>) => void
  }
  /**
   * Whether the server still lists this device's slot; null when it can't tell.
   * Throws when the list fails.
   */
  hasServerCopy?: () => Promise<boolean | null>
  log?: (level: 'info' | 'warn', message: string) => void
  /** A failed attempt, for analytics. */
  onFailure?: (code: BackupFailure) => void
  onRunningChange?: (running: boolean) => void
}

export type RunOptions = {
  /**
   * The User asked (Back Up Now, turning backup on, Tools): skips the debounce
   * and any failure backoff, and uploads even when unchanged unless the last
   * upload was under a minute ago.
   */
  force?: boolean
}

export function createBackupScheduler(deps: BackupSchedulerDeps) {
  let timer: unknown = null
  let inFlight: Promise<BackupRunOutcome> | null = null
  let generation = 0
  /** When the oldest change not yet covered was made, for `MAX_PENDING_MS`. */
  let pendingSince: number | null = null
  /** The last look at the server's slots, for `SERVER_CHECK_MS`. */
  let serverCheckedAt: number | null = null
  let checkingServer = false
  /** Wakes the next server check; only while in the foreground. */
  let checkTimer: unknown = null
  let foreground = false
  /** Whether this launch has come to the foreground yet. */
  let launched = false

  const state = () => deps.state.get()
  const log = (level: 'info' | 'warn', message: string) =>
    deps.log?.(level, message)

  const due = () => {
    const { lastPutAt } = state()
    return lastPutAt === null || deps.now() - lastPutAt >= BACKUP_DAILY_MS
  }

  /** The earliest an automatic attempt may run. */
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

  /** Runs automatically at `at` (or a little after, for long waits). */
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

  /** Plans the next automatic attempt from the current state. */
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
    // Nothing pending: the daily upload.
    arm(Math.max(notBefore(), (lastPutAt ?? deps.now()) + BACKUP_DAILY_MS))
  }

  /**
   * The server had no slot for this device in a list that started at
   * `listedAt`: deleted from another device. Uploads again soon, unless an
   * upload since then (or running now) put it back.
   */
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

  /** Whether there's a server copy worth checking on. */
  const checking = () =>
    deps.hasServerCopy !== undefined &&
    deps.isEnabled() &&
    state().lastPutAt !== null

  function cancelCheck() {
    if (checkTimer !== null) deps.clearTimer(checkTimer)
    checkTimer = null
  }

  /** Plans the next server check, unless one is planned already. */
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

  /**
   * Lists the server's slots when that's due, then plans the next; never
   * throws.
   */
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
      // The next check asks again.
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
        // The server allows one put a slot a minute.
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
      // The slot is there now: the next check can wait its full interval.
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

  /** One attempt at a time; a second caller shares the running one. */
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

  /** Leaving the app: what's pending goes now. */
  function uploadPending() {
    if (!deps.isEnabled() || !state().pending) return
    if (deps.now() >= notBefore()) void run('background')
  }

  return {
    run,
    /** Local data changed: upload once it settles. */
    noteChange() {
      generation++
      if (!deps.isEnabled()) return
      const now = deps.now()
      pendingSince ??= now
      if (!state().pending) deps.state.set({ pending: true })
      if (inFlight) return // Its finish plans the next one.
      const latest = pendingSince + BACKUP_MAX_PENDING_MS
      arm(Math.max(Math.min(now + BACKUP_DEBOUNCE_MS, latest), notBefore()))
    },
    /**
     * The app is leaving the foreground, or may be (`inactive`, which iOS also
     * passes through for Control Center and system sheets): what's pending goes
     * now.
     */
    onInactive: uploadPending,
    /** The app went to the background: as `onInactive`, and checks pause. */
    onBackground() {
      foreground = false
      cancelCheck()
      uploadPending()
    },
    /** A real return to the app, or the launch. */
    onForeground() {
      foreground = true
      // Only updating fixes `update`, and an update relaunches the app, so the
      // launch tries again instead of waiting out the day.
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
    /** The connection came back. */
    onReconnect() {
      if (!deps.isEnabled() || state().lastError !== 'offline') return
      deps.state.set({ retryAt: null })
      plan(BACKUP_FOREGROUND_DELAY_MS)
    },
    /**
     * A slot list that started at `listedAt` (Settings) showed whether this
     * device's slot is there; counts as the next server check.
     */
    serverCopyListed(present: boolean, listedAt: number) {
      serverCheckedAt = deps.now()
      if (!present) serverCopyMissing(listedAt)
      armCheck()
    },
    /** Backup was turned off, or this device's backup state was reset. */
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
