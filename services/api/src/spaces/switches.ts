import type { Environment } from '../types'
import { SPACES_LIMITS } from './contracts'

/**
 * Shared Spaces' switches (witness-work ADR 0037), both in `NOTES_KV` and
 * edge-cached for 60 seconds like `buddies:enabled`:
 *
 * - `spaces:enabled`: `"true"` turns Shared Spaces on, anything else off;
 *   absent (or unreadable), the `SPACES_ENABLED` var decides the same way.
 * - `spaces:maxMembers`: members plus open invites a space may hold, a
 *   whole number from 1 to `maxMembersCeiling`; absent or anything else,
 *   `defaultMaxMembers` (10).
 * - `spaces:guests`: `"true"` turns the public guest ops (`guest/sync`,
 *   `guest/put`) on, anything else off; absent (or unreadable), the
 *   `SPACES_GUESTS` var decides the same way. They also need
 *   `spaces:enabled`. `link/create` works either way.
 */

export const SPACES_ENABLED_KEY = 'spaces:enabled'
export const SPACES_GUESTS_KEY = 'spaces:guests'
export const SPACES_MAX_MEMBERS_KEY = 'spaces:maxMembers'
const CACHE_TTL_SECONDS = 60

export type SpacesSwitchEnv = Pick<Environment, 'SPACES_ENABLED' | 'SPACES_GUESTS'> & {
  NOTES_KV: Pick<KVNamespace, 'get'>
}

const read = async (
  env: Pick<SpacesSwitchEnv, 'NOTES_KV'>,
  key: string
): Promise<string | null> => {
  try {
    return await env.NOTES_KV.get(key, { cacheTtl: CACHE_TTL_SECONDS })
  } catch {
    console.warn('spaces: switch KV read failed; using the default', { key })
    return null
  }
}

export const isSpacesEnabled = async (env: SpacesSwitchEnv): Promise<boolean> => {
  const value = await read(env, SPACES_ENABLED_KEY)
  return (value ?? env.SPACES_ENABLED ?? '').trim() === 'true'
}

/** Whether the guest ops run (`spaces:guests`, then `SPACES_GUESTS`). */
export const isSpacesGuestsEnabled = async (
  env: SpacesSwitchEnv
): Promise<boolean> => {
  const value = await read(env, SPACES_GUESTS_KEY)
  return (value ?? env.SPACES_GUESTS ?? '').trim() === 'true'
}

/** The member cap a space's invites and joins are held to right now. */
export const spacesMaxMembers = async (
  env: Pick<SpacesSwitchEnv, 'NOTES_KV'>
): Promise<number> => {
  const value = (await read(env, SPACES_MAX_MEMBERS_KEY))?.trim() ?? ''
  const cap = /^\d{1,4}$/.test(value) ? Number(value) : NaN
  return cap >= 1 && cap <= SPACES_LIMITS.maxMembersCeiling
    ? cap
    : SPACES_LIMITS.defaultMaxMembers
}
