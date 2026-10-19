import { MMKV } from 'react-native-mmkv'
import { analytics } from '@/lib/analytics'

/** The hidden moments (`docs/pet-companion.md` → Hidden moments). */
export type PetSecret =
  | 'trick'
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

/** Forgets which secrets were found (dev harness). */
export function forgetFoundSecrets(): void {
  try {
    flags().clearAll()
  } catch {
    // Nothing to forget.
  }
}
