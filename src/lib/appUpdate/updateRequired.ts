import { create } from 'zustand'
import { HttpError, request } from '@/lib/http/request'
import { belowMinVersion } from '@/lib/appUpdate/versionGate'

/**
 * Update Required, app-wide (ADR 0027 §6): this app version is below the
 * minimum ww-api asks for (`GET /app/v1/config`), or ww-api refused a request
 * with 426 `upgrade_required`. Either blocks the app until the User updates.
 */

export type UpdateRequiredSource =
  /** `minAppVersion` from `GET /app/v1/config`. */
  | 'config'
  /** A 426 `upgrade_required` answer. */
  | 'server'

export type UpdateRequired = {
  source: UpdateRequiredSource
  currentVersion: string | null
  minVersion: string | null
}

export const useUpdateRequired = create<{ required: UpdateRequired | null }>(
  () => ({ required: null })
)

/**
 * Ww-api answered 426: blocks for the rest of this launch. Whatever the config
 * says, requests already fail without an update.
 */
export function requireUpdateFromServer(currentVersion: string | null) {
  const required = useUpdateRequired.getState().required
  if (required?.source === 'server') return
  useUpdateRequired.setState({
    required: {
      source: 'server',
      currentVersion,
      minVersion: required?.minVersion ?? null,
    },
  })
}

/** Cloud Sync's switches (ADR 0030), for devices without a session. */
export type AppSyncConfig = {
  enabled: boolean
  entitlement: 'supporter' | 'everyone'
}

export type AppConfig = {
  minAppVersion: string | null
  /** Null from a worker before Cloud Sync. */
  sync: AppSyncConfig | null
}

/** `GET /app/v1/config`. Failures throw `HttpError`. */
export async function fetchAppConfig(
  url: string,
  fetchImpl?: typeof fetch
): Promise<AppConfig> {
  const response = await request<{
    ok?: unknown
    minAppVersion?: unknown
    sync?: { enabled?: unknown; entitlement?: unknown } | null
  } | null>({ url, timeoutMs: 8_000, fetchImpl })
  if (response.data?.ok !== true)
    throw new HttpError('server', response.status, 'unexpected_response')
  const { minAppVersion, sync } = response.data
  return {
    minAppVersion: typeof minAppVersion === 'string' ? minAppVersion : null,
    sync:
      sync && typeof sync.enabled === 'boolean'
        ? {
            enabled: sync.enabled,
            entitlement:
              sync.entitlement === 'everyone' ? 'everyone' : 'supporter',
          }
        : null,
  }
}

/**
 * The worker edge-caches the config for 60 seconds, so asking more often learns
 * nothing.
 */
export const APP_CONFIG_MIN_INTERVAL_MS = 60_000

/**
 * Reads the config at most once a minute (callers share one request) and blocks
 * or unblocks the app from it. A failure (offline, say) changes nothing: a
 * working app is never locked for a config it couldn't read. It doesn't count
 * toward the minute, so the next check after it asks again.
 */
export function createAppConfigCheck(deps: {
  fetchConfig: () => Promise<
    Partial<AppConfig> & { minAppVersion: string | null }
  >
  currentVersion: () => string | null | undefined
  now: () => number
  /** Every config read, for what else it carries (Cloud Sync's switches). */
  onConfig?: (config: AppConfig) => void
}) {
  let lastAt = -Infinity
  let pending: Promise<void> | null = null
  return function check({ force = false }: { force?: boolean } = {}) {
    if (pending) return pending
    if (!force && deps.now() - lastAt < APP_CONFIG_MIN_INTERVAL_MS)
      return Promise.resolve()
    lastAt = deps.now()
    pending = deps
      .fetchConfig()
      .then(({ minAppVersion, sync = null }) => {
        deps.onConfig?.({ minAppVersion, sync })
        const required = useUpdateRequired.getState().required
        if (required?.source === 'server') return
        const below = belowMinVersion(deps.currentVersion(), minAppVersion)
        if (below)
          useUpdateRequired.setState({
            required: { source: 'config', ...below },
          })
        // The floor came down again.
        else if (required) useUpdateRequired.setState({ required: null })
      })
      // Nothing was learned: the next foreground or reconnect asks again.
      .catch(() => {
        lastAt = -Infinity
      })
      .finally(() => {
        pending = null
      })
    return pending
  }
}
