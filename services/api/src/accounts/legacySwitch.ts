import type { Environment } from '../types'
import { buddiesErrorResponse } from '../buddies/errorResponse'

/**
 * The legacy switch (witness-work ADR 0027, `docs/accounts-protocol.md`,
 * "Updates and the legacy switch"). While it's on, every route converted to
 * bearer tokens (accounts, backup, handoff, and later Buddies and Notes
 * Import) also accepts the way it authenticated before sessions: the signed
 * envelope or the per-request attestation. Off, those requests get 426
 * `upgrade_required`, and the app shows Update Required.
 *
 * KV `auth:legacy` in `NOTES_KV`: `"off"` (or `"false"`) turns it off, `"on"`
 * (or `"true"`) on. Absent or anything else falls back to the `AUTH_LEGACY`
 * var the same way, and then to on. A failed read counts as off (witness-work
 * ADR 0038 §11): the old ways of signing requests never come back because KV
 * is down. Edge-cached for 60 seconds.
 */

export const AUTH_LEGACY_KEY = 'auth:legacy'
const CACHE_TTL_SECONDS = 60
const OFF = new Set(['off', 'false'])
const ON = new Set(['on', 'true'])

export type LegacySwitchEnv = Pick<Environment, 'AUTH_LEGACY'> & {
  NOTES_KV: Pick<KVNamespace, 'get'>
}

/**
 * A KV on/off switch: `"off"`/`"false"` or `"on"`/`"true"` in KV `key`
 * (edge-cached 60 s), else the same words in `fallback` (a var), else on. A
 * failed KV read answers `onReadFailure`, logged as `name`.
 */
export const readKvSwitch = async (
  kv: Pick<KVNamespace, 'get'>,
  key: string,
  fallback: string | undefined,
  { onReadFailure, name }: { onReadFailure: boolean; name: string }
): Promise<boolean> => {
  let value: string | null = null
  try {
    value = await kv.get(key, { cacheTtl: CACHE_TTL_SECONDS })
  } catch {
    console.warn(`accounts: ${name} KV read failed; ${onReadFailure ? 'on' : 'off'}`)
    return onReadFailure
  }
  const stored = value?.trim().toLowerCase()
  if (stored && OFF.has(stored)) return false
  if (stored && ON.has(stored)) return true
  return !OFF.has(fallback?.trim().toLowerCase() ?? '')
}

export const isLegacyAuthEnabled = (env: LegacySwitchEnv): Promise<boolean> =>
  readKvSwitch(env.NOTES_KV, AUTH_LEGACY_KEY, env.AUTH_LEGACY, {
    // ADR 0038 §11: never back on because KV is down.
    onReadFailure: false,
    name: 'legacy switch',
  })

/** 426 `upgrade_required`, without `Retry-After`: only updating helps. */
export const upgradeRequiredResponse = (): Response =>
  buddiesErrorResponse('upgrade_required')

/**
 * For a request authenticated the old way: null while the legacy switch is
 * on, 426 `upgrade_required` once it's off.
 */
export const refuseLegacyAuth = async (
  env: LegacySwitchEnv
): Promise<Response | null> =>
  (await isLegacyAuthEnabled(env)) ? null : upgradeRequiredResponse()
