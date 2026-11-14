import type { Environment } from '../types'
import type { SessionCapability } from './contracts'

/**
 * Cloud Sync's switches (witness-work ADR 0030), both in `NOTES_KV` and
 * edge-cached for 60 seconds like `buddies:enabled`:
 *
 * - `sync:enabled`: `"true"` or `"on"` turns Cloud Sync on, anything else off;
 *   absent (or unreadable), the `SYNC_ENABLED` var decides the same way.
 * - `sync:entitlement`: `"supporter"` makes it a Supporter benefit again
 *   (the lever back, in any case); `"everyone"` (and anything else) keeps it free, as
 *   witness-work ADR 0040 decided. Absent (or unreadable), the
 *   `SYNC_ENTITLEMENT` var decides the same way, else `everyone`.
 * - `sync:photos`: `"off"` (or `"false"`) refuses photo puts
 *   (`photos_disabled`); anything else keeps them on. Absent (or
 *   unreadable), the `SYNC_PHOTOS` var decides the same way, else on.
 * - `sync:changes`: `"true"` or `"on"` turns record changes on (witness-work
 *   ADR 0060), anything else off (`changes_disabled`). Absent (or
 *   unreadable), the `SYNC_CHANGES` var decides the same way, else off.
 */

export const SYNC_ENABLED_KEY = 'sync:enabled'
export const SYNC_ENTITLEMENT_KEY = 'sync:entitlement'
export const SYNC_PHOTOS_KEY = 'sync:photos'
export const SYNC_CHANGES_KEY = 'sync:changes'
const OFF = new Set(['off', 'false'])
const CACHE_TTL_SECONDS = 60
const ON = new Set(['true', 'on'])

export type SyncEntitlement = 'supporter' | 'everyone'

export type SyncSwitchEnv = Pick<
  Environment,
  'SYNC_ENABLED' | 'SYNC_ENTITLEMENT' | 'SYNC_PHOTOS' | 'SYNC_CHANGES'
> & { NOTES_KV: Pick<KVNamespace, 'get'> }

const read = async (
  env: SyncSwitchEnv,
  key: string
): Promise<string | null> => {
  try {
    return await env.NOTES_KV.get(key, { cacheTtl: CACHE_TTL_SECONDS })
  } catch {
    console.warn('sync: switch KV read failed; using the var', { key })
    return null
  }
}

export const isSyncEnabled = async (env: SyncSwitchEnv): Promise<boolean> => {
  const value = await read(env, SYNC_ENABLED_KEY)
  return ON.has((value ?? env.SYNC_ENABLED ?? '').trim())
}

export const syncEntitlement = async (
  env: SyncSwitchEnv
): Promise<SyncEntitlement> => {
  const value = await read(env, SYNC_ENTITLEMENT_KEY)
  return (value ?? env.SYNC_ENTITLEMENT ?? '').trim().toLowerCase() ===
    'supporter'
    ? 'supporter'
    : 'everyone'
}

/** Whether photo puts are on (`sync:photos`, then `SYNC_PHOTOS`, else on). */
export const isSyncPhotosOn = async (env: SyncSwitchEnv): Promise<boolean> => {
  const value = await read(env, SYNC_PHOTOS_KEY)
  return !OFF.has((value ?? env.SYNC_PHOTOS ?? '').trim().toLowerCase())
}

/** Whether record changes are on (`sync:changes`, then `SYNC_CHANGES`, else off). */
export const isSyncChangesOn = async (env: SyncSwitchEnv): Promise<boolean> => {
  const value = await read(env, SYNC_CHANGES_KEY)
  return ON.has((value ?? env.SYNC_CHANGES ?? '').trim().toLowerCase())
}

/** Both switches, as `GET /app/v1/config` and `GET /accounts/v1/sync` say them. */
export const syncSwitches = async (
  env: SyncSwitchEnv
): Promise<{ enabled: boolean; entitlement: SyncEntitlement }> => {
  const [enabled, entitlement] = await Promise.all([
    isSyncEnabled(env),
    syncEntitlement(env),
  ])
  return { enabled, entitlement }
}

/** The capability `everyone`'s Cloud Sync needs. */
export const SYNC_EVERYONE_CAPABILITY: SessionCapability = 'sync-everyone'

/**
 * The entitlement an app sees: `everyone` reaches only apps (and browsers)
 * that send the `sync-everyone` capability, which turn Cloud Sync on by
 * themselves only for a new install. Apps that never send it, at any version,
 * keep the Supporter rule: they turn it on for any device that never chose
 * (witness-work ADR 0040 §2).
 */
export const entitlementForApp = (
  entitlement: SyncEntitlement,
  capabilities: readonly string[] | null | undefined
): SyncEntitlement =>
  entitlement === 'everyone' && capabilities?.includes(SYNC_EVERYONE_CAPABILITY)
    ? 'everyone'
    : 'supporter'
