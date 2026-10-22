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
 * Whether Decorate Room has shown `item`, a secret room item, since it opened
 * up on this install. Until it has, its cell says "New".
 */
export function secretItemSeen(item: string): boolean {
  try {
    return flags().getBoolean(`seen:${item}`) ?? false
  } catch {
    return true
  }
}

/** Notes that Decorate Room has shown these opened secret items. */
export function markSecretItemsSeen(items: readonly string[]): void {
  try {
    for (const item of items) flags().set(`seen:${item}`, true)
  } catch {
    // The "New" label shows again next time.
  }
}

/** Forgets which secrets were found and secret items shown (dev harness). */
export function forgetFoundSecrets(): void {
  try {
    flags().clearAll()
  } catch {
    // Nothing to forget.
  }
}
