import { MMKV } from 'react-native-mmkv'
import { analytics } from '@/lib/analytics'

/** The hidden moments (`docs/pet-companion.md` → Hidden moments). */
export type PetSecret =
  | 'trick'
  | 'twirl'
  | 'gift'
  | 'paradise'
  | 'star'
  | 'rainbow'
  | 'visitor'
  | 'gold'

// Lazy, so importing this module never constructs native storage.
let store: MMKV | null = null
const flags = (): MMKV => (store ??= new MMKV({ id: 'pet-secrets' }))

/**
 * Sends `pet_secret_found` the first time this install sees `secret`; later
 * sightings send nothing. Holds only the secret ids.
 */
export function noteSecretFound(secret: PetSecret): void {
  try {
    if (flags().getBoolean(secret)) return
    flags().set(secret, true)
  } catch {
    return
  }
  analytics.capture('pet_secret_found', { secret })
}

/**
 * Whether the User has picked `item`, a room item or hat, in Decorate Room or
 * the Shop on this install. Until they have, an owned item says "New" (ADR
 * 0035), so items earned before the Shop, and secrets as they're found, stand
 * out until tried.
 */
export function roomItemPicked(item: string): boolean {
  try {
    return flags().getBoolean(`picked:${item}`) ?? false
  } catch {
    return true
  }
}

/** `roomItemPicked`, a new one whenever which items were picked changes. */
let pickedNow = (item: string) => roomItemPicked(item)
const pickedListeners = new Set<() => void>()
const notePickedChanged = () => {
  pickedNow = (item: string) => roomItemPicked(item)
  for (const listener of pickedListeners) listener()
}

/** Calls `listener` when which items were picked changes. */
export function subscribeRoomItemsPicked(listener: () => void): () => void {
  pickedListeners.add(listener)
  return () => {
    pickedListeners.delete(listener)
  }
}

/**
 * `roomItemPicked` for `useSyncExternalStore`: a new function whenever which
 * items were picked changes, so what reads it re-renders.
 */
export const roomItemsPickedSnapshot = (): ((item: string) => boolean) =>
  pickedNow

/** Notes that the User picked `item`, so it no longer says "New". */
export function noteRoomItemPicked(item: string): void {
  if (roomItemPicked(item)) return
  try {
    flags().set(`picked:${item}`, true)
  } catch {
    // The "New" label shows again next time.
  }
  notePickedChanged()
}

/** Forgets which secrets were found and items picked (dev harness). */
export function forgetFoundSecrets(): void {
  try {
    flags().clearAll()
  } catch {
    // Nothing to forget.
  }
  notePickedChanged()
}
