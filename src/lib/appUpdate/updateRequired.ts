import { create } from 'zustand'
import { HttpError, request } from '@/lib/http/request'
import { belowMinVersion } from '@/lib/appUpdate/versionGate'
import { SESSION_CAPABILITIES } from '@/lib/serverAccount/capabilities'
import {
  parseVisitorLocation,
  type VisitorLocation,
} from '@/lib/visitorLocation'

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

  changes: boolean
}

export type AppWebSignupConfig = {
  enabled: boolean
  turnstileSiteKey: string | null
}

export type AppBuddiesConfig = {
  maxBuddies: number
  maxOpenInvites: number
}

export type AppConfig = {
  minAppVersion: string | null

  sync: AppSyncConfig | null

  webSignup?: AppWebSignupConfig

  buddies?: AppBuddiesConfig

  location?: VisitorLocation
}

const isPositiveInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) > 0

export async function fetchAppConfig(
  url: string,
  fetchImpl?: typeof fetch
): Promise<AppConfig> {
  const response = await request<{
    ok?: unknown
    minAppVersion?: unknown
    sync?: {
      enabled?: unknown
      entitlement?: unknown
      changes?: unknown
    } | null
    webSignup?: { enabled?: unknown; turnstileSiteKey?: unknown } | null
    buddies?: { maxBuddies?: unknown; maxOpenInvites?: unknown } | null
    country?: unknown
    regionCode?: unknown
  } | null>({
    url: `${url}?capabilities=${SESSION_CAPABILITIES.join(',')}`,
    timeoutMs: 8_000,
    fetchImpl,
  })
  if (response.data?.ok !== true)
    throw new HttpError('server', response.status, 'unexpected_response')
  const { minAppVersion, sync, webSignup, buddies, country, regionCode } =
    response.data
  return {
    minAppVersion: typeof minAppVersion === 'string' ? minAppVersion : null,
    sync:
      sync && typeof sync.enabled === 'boolean'
        ? {
            enabled: sync.enabled,
            entitlement:
              sync.entitlement === 'everyone' ? 'everyone' : 'supporter',
            changes: sync.changes === true,
          }
        : null,
    ...(webSignup &&
      typeof webSignup.enabled === 'boolean' && {
        webSignup: {
          enabled: webSignup.enabled,
          turnstileSiteKey:
            typeof webSignup.turnstileSiteKey === 'string' &&
            webSignup.turnstileSiteKey
              ? webSignup.turnstileSiteKey
              : null,
        },
      }),
    ...(buddies &&
      isPositiveInteger(buddies.maxBuddies) &&
      isPositiveInteger(buddies.maxOpenInvites) && {
        buddies: {
          maxBuddies: buddies.maxBuddies,
          maxOpenInvites: buddies.maxOpenInvites,
        },
      }),
    ...('country' in response.data && {
      location: parseVisitorLocation(country, regionCode),
    }),
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
      .then(({ minAppVersion, sync = null, buddies }) => {
        deps.onConfig?.({ minAppVersion, sync, ...(buddies && { buddies }) })
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
