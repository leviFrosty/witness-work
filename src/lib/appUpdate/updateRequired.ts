import { create } from 'zustand'
import { HttpError, request } from '@/lib/http/request'
import { belowMinVersion } from '@/lib/appUpdate/versionGate'

export type UpdateRequiredSource = 'config' | 'server'

export type UpdateRequired = {
  source: UpdateRequiredSource
  currentVersion: string | null
  minVersion: string | null
}

export const useUpdateRequired = create<{ required: UpdateRequired | null }>(
  () => ({ required: null })
)

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

export type AppSyncConfig = {
  enabled: boolean
  entitlement: 'supporter' | 'everyone'
}

export type AppConfig = {
  minAppVersion: string | null

  sync: AppSyncConfig | null
}

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

export const APP_CONFIG_MIN_INTERVAL_MS = 60_000

export function createAppConfigCheck(deps: {
  fetchConfig: () => Promise<
    Partial<AppConfig> & { minAppVersion: string | null }
  >
  currentVersion: () => string | null | undefined
  now: () => number

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
        else if (required) useUpdateRequired.setState({ required: null })
      })

      .catch(() => {
        lastAt = -Infinity
      })
      .finally(() => {
        pending = null
      })
    return pending
  }
}
