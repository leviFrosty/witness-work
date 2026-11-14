import type { Environment } from '../types'

export const BUDDIES_ENABLED_KEY = 'buddies:enabled'
const CACHE_TTL_SECONDS = 60
/** A flip takes up to one cache lifetime to reach every colo. */
export const KILL_SWITCH_RETRY_AFTER_SECONDS = CACHE_TTL_SECONDS

export type KillSwitchEnv = Pick<Environment, 'BUDDIES_ENABLED'> & {
  NOTES_KV: Pick<KVNamespace, 'get'>
}

/**
 * Buddies is enabled iff KV `buddies:enabled` is `"true"`. When the key is
 * absent (or KV can't be read) the `BUDDIES_ENABLED` var decides. The KV read
 * is edge-cached for 60 seconds, like `notes-import:limits`.
 */
export const isBuddiesEnabled = async (
  env: KillSwitchEnv
): Promise<boolean> => {
  let value: string | null = null
  try {
    value = await env.NOTES_KV.get(BUDDIES_ENABLED_KEY, {
      cacheTtl: CACHE_TTL_SECONDS,
    })
  } catch {
    console.warn('buddies: kill-switch KV read failed; using BUDDIES_ENABLED')
  }
  if (value != null) return value.trim() === 'true'
  return env.BUDDIES_ENABLED?.trim() === 'true'
}

export const BUDDIES_PHOTOS_KEY = 'buddies:photos'
/** Values of `buddies:photos` / `BUDDIES_PHOTOS` that turn photos on. */
const PHOTOS_ON = new Set(['on', 'true'])

export type PhotosSwitchEnv = Pick<Environment, 'BUDDIES_PHOTOS'> & {
  NOTES_KV: Pick<KVNamespace, 'get'>
}

/**
 * Photo blobs (`blob/put`, `blob/get`, `blob/delete`) are on iff KV
 * `buddies:photos` is `"on"` (`"true"` is accepted too). When the key is
 * absent (or KV can't be read) the `BUDDIES_PHOTOS` var decides: `"on"` in
 * Beta and dev, unset (off) in prod. Edge-cached for 60 seconds like
 * `buddies:enabled`, and only consulted when Buddies itself is on.
 */
export const isBuddiesPhotosEnabled = async (
  env: PhotosSwitchEnv
): Promise<boolean> => {
  let value: string | null = null
  try {
    value = await env.NOTES_KV.get(BUDDIES_PHOTOS_KEY, {
      cacheTtl: CACHE_TTL_SECONDS,
    })
  } catch {
    console.warn('buddies: photos KV read failed; using BUDDIES_PHOTOS')
  }
  if (value != null) return PHOTOS_ON.has(value.trim())
  return PHOTOS_ON.has(env.BUDDIES_PHOTOS?.trim() ?? '')
}
