import { useNotesImportEnabled } from '@/hooks/useNotesImportEnabled'
import { useEffect } from 'react'
import { Platform } from 'react-native'
import Constants from 'expo-constants'
import { create } from 'zustand'
import { addForegroundListener } from '@/lib/appLifecycle'
import { classifyNetworkError } from '@/lib/http/networkError'
import { addReconnectListener, getOnline } from '@/lib/http/online'
import { perf } from '@/lib/perf'
import { accountSuspended, onAccountStatus } from '@/lib/serverAccount'
import {
  fetchNotesImportStatus,
  notesImportDeviceUnverified,
} from '@/features/notes-import/lib/notesImportClient'
import type { NotesImportPublicSchedule } from '@/features/notes-import/lib/notesImportUsage'
import {
  notesImportUpdateRequired,
  type NotesImportUpdateRequired,
} from '@/features/notes-import/lib/notesImportVersionGate'

/**
 * - `disabled`: the feature flag is closed; nothing is checked.
 * - `checking`: the first check of this session is running.
 * - `available` / `unavailable`: the server answered (unavailable covers its kill
 *   switch, the version floor, Android without Play Integrity, a device that
 *   can't be verified, so it can't have the account session Notes Import needs,
 *   and a suspended account, reason `suspended`).
 * - `offline`: the check couldn't run because the device has no connection.
 * - `failed`: the device is online but the check didn't get an answer.
 */
export type NotesImportAvailabilityStatus =
  | 'disabled'
  | 'checking'
  | 'available'
  | 'unavailable'
  | 'offline'
  | 'failed'

export interface NotesImportAvailability {
  /** True only after both the feature flag and availability probe succeed. */
  available: boolean
  status: NotesImportAvailabilityStatus
  /** Operator detail for an explicit unavailable response. */
  reason: string | null
  /** Fresh public allowance schedule held in memory for this app session only. */
  schedule: NotesImportPublicSchedule | null
  /**
   * Set when this build is below the proxy's advertised minimum app version.
   * `available` is false and `reason` is `'version_below_min'` in that case.
   */
  updateRequired: NotesImportUpdateRequired | null
  /**
   * Pages per Import from Paper batch when the server can read page photos;
   * null hides the option.
   */
  paperMaxPages: number | null
  /** The first check is running and nothing is known yet (`checking`). */
  loading: boolean
  /** Any check is in flight, including a refresh that keeps the last answer. */
  refreshing: boolean
  /** Check again now, ignoring the cache (a Try Again button). */
  retry: () => void
}

type ProbeResult = {
  status: 'available' | 'unavailable' | 'offline' | 'failed'
  reason: string | null
  schedule: NotesImportPublicSchedule | null
  updateRequired: NotesImportUpdateRequired | null
  paperMaxPages: number | null
}

interface AvailabilityStore {
  /** Null until the first check of this session finishes. */
  result: ProbeResult | null
  refreshing: boolean
  probe: (options?: { force?: boolean }) => Promise<void>
}

/** Server answers are reused for 30 s from request start. */
export const STATUS_FRESHNESS_MS = 30_000
/**
 * Failures are reused briefly (from when they finished) so every consumer
 * mounting at once doesn't re-probe a dead connection.
 */
export const FAILURE_FRESHNESS_MS = 5_000
/** Returning to the app re-checks at most this often. */
export const FOREGROUND_RECHECK_MS = 30_000

let freshUntil = 0
let inFlight: Promise<void> | null = null
/** A forced check was asked for while one already started was running. */
let checkAgain = false

const isFailure = (result: ProbeResult | null): boolean =>
  result?.status === 'offline' || result?.status === 'failed'

/**
 * Offline only when the device has no connection. A refused or dropped
 * connection while the OS reports one means our service didn't answer.
 */
const failureStatus = (error: unknown): 'offline' | 'failed' => {
  const online = getOnline()
  if (online === false) return 'offline'
  if (online === null && classifyNetworkError(error) === 'offline')
    return 'offline'
  return 'failed'
}

const fromStatus = async (): Promise<ProbeResult> => {
  const closed = { schedule: null, updateRequired: null, paperMaxPages: null }
  // Asked alongside the status: it never opens a session or contacts the
  // server for the account, and a failure means it isn't known.
  const deviceUnverified = notesImportDeviceUnverified().catch(() => false)
  // Only an account this device saw suspended is read again, here.
  const suspended = accountSuspended().catch(() => false)
  let status
  try {
    status = await fetchNotesImportStatus()
  } catch (error) {
    return { ...closed, status: failureStatus(error), reason: null }
  }
  // The version floor wins over every other state: it is the one condition the
  // user can resolve themselves, and an update is required regardless of
  // whether the proxy is also down right now.
  const updateRequired = notesImportUpdateRequired(
    Constants.expoConfig?.version,
    status.minAppVersion
  )
  if (updateRequired) {
    return {
      status: 'unavailable',
      reason: 'version_below_min',
      schedule: null,
      updateRequired,
      paperMaxPages: null,
    }
  }
  // Android needs a worker that can verify Play Integrity tokens.
  if (Platform.OS === 'android' && !status.playIntegrity) {
    return { ...closed, status: 'unavailable', reason: 'android_unavailable' }
  }
  if (!status.available) {
    return { ...closed, status: 'unavailable', reason: status.reason ?? null }
  }
  // Every import goes through the attested account session (ADR 0027).
  if (await deviceUnverified) {
    return { ...closed, status: 'unavailable', reason: 'device_unverified' }
  }
  // Said before the User writes anything, not after they submit.
  if (await suspended) {
    return { ...closed, status: 'unavailable', reason: 'suspended' }
  }
  return {
    status: 'available',
    reason: null,
    schedule: status.limits,
    updateRequired: null,
    paperMaxPages: status.transcribe?.maxPages ?? null,
  }
}

/**
 * Session-only status state. Nothing here is persisted: Help and Paywall may
 * make explicit allowance claims only from an available response received since
 * this JS session started. Consumers share one pending request, reuse answers
 * for 30 seconds from request start and failures for 5 seconds, and keep
 * showing the last answer while a refresh runs. This does not poll; it
 * re-checks when a consumer mounts, the app returns to the foreground, or the
 * connection comes back. The API may additionally reuse its public hint for 30
 * seconds.
 */
const useAvailabilityStore = create<AvailabilityStore>((set, get) => ({
  result: null,
  refreshing: false,

  probe: ({ force = false } = {}) => {
    if (inFlight) {
      // Its answer predates what forced this one (the account's status, the
      // connection coming back), so it runs again once that answer lands.
      if (force) checkAgain = true
      return inFlight
    }
    if (!force && Date.now() < freshUntil) return Promise.resolve()
    const startedAt = Date.now()
    perf.count('notesImport:availabilityProbe')
    set({ refreshing: true })
    inFlight = fromStatus()
      .then((result) => {
        // Anchor answers to request start, so slow responses don't extend them.
        freshUntil = isFailure(result)
          ? Date.now() + FAILURE_FRESHNESS_MS
          : startedAt + STATUS_FRESHNESS_MS
        set({ result, refreshing: false })
      })
      .finally(() => {
        inFlight = null
        if (get().refreshing) set({ refreshing: false })
        if (!checkAgain) return
        checkAgain = false
        void get().probe({ force: true })
      })
    return inFlight
  },
}))

const retry = () => {
  void useAvailabilityStore.getState().probe({ force: true })
}

/**
 * Probes Notes Import availability and shares only this session's latest valid
 * schedule. Access stays closed until the first check succeeds and after a
 * failed one; a refresh keeps the last answer instead of closing access.
 */
export const useNotesImportAvailability = (): NotesImportAvailability => {
  const enabled = useNotesImportEnabled()
  const result = useAvailabilityStore((state) => state.result)
  const refreshing = useAvailabilityStore((state) => state.refreshing)
  const probe = useAvailabilityStore((state) => state.probe)

  useEffect(() => {
    if (!enabled) return
    void probe()
    // Fresh answers make these no-ops; a failed one is retried right away
    // when the connection comes back.
    const foreground = addForegroundListener(() => void probe(), {
      minIntervalMs: FOREGROUND_RECHECK_MS,
    })
    // A check still running started while the connection was down.
    const reconnect = addReconnectListener(() => {
      const { result, refreshing } = useAvailabilityStore.getState()
      void probe({ force: refreshing || isFailure(result) })
    })
    // A call found the account suspended (an import refused) or reinstated.
    const status = onAccountStatus(() => void probe({ force: true }))
    return () => {
      foreground.remove()
      reconnect.remove()
      status()
    }
  }, [probe, enabled])

  if (!enabled || !result) {
    return {
      available: false,
      status: enabled ? 'checking' : 'disabled',
      reason: null,
      schedule: null,
      updateRequired: null,
      paperMaxPages: null,
      loading: enabled,
      refreshing: enabled && refreshing,
      retry,
    }
  }
  return {
    available: result.status === 'available',
    status: result.status,
    reason: result.reason,
    schedule: result.schedule,
    updateRequired: result.updateRequired,
    paperMaxPages: result.paperMaxPages,
    loading: false,
    refreshing,
    retry,
  }
}
