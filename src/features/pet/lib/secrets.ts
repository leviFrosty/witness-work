import { MMKV } from 'react-native-mmkv'
import { analytics } from '@/lib/analytics'

export type PetSecret =
  | 'trick'
  | 'twirl'
  | 'gift'
  | 'paradise'
  | 'star'
  | 'rainbow'
  | 'visitor'
  | 'gold'

let store: MMKV | null = null
const flags = (): MMKV => (store ??= new MMKV({ id: 'pet-secrets' }))

export function noteSecretFound(secret: PetSecret): void {
  try {
    if (flags().getBoolean(secret)) return
    flags().set(secret, true)
  } catch {
    return
  }
  analytics.capture('pet_secret_found', { secret })
}

export function roomItemPicked(item: string): boolean {
  try {
    return flags().getBoolean(`picked:${item}`) ?? false
  } catch {
    return true
  }
}

let pickedNow = (item: string) => roomItemPicked(item)
const pickedListeners = new Set<() => void>()
const notePickedChanged = () => {
  pickedNow = (item: string) => roomItemPicked(item)
  for (const listener of pickedListeners) listener()
}

export function subscribeRoomItemsPicked(listener: () => void): () => void {
  pickedListeners.add(listener)
  return () => {
    pickedListeners.delete(listener)
  }
}

export const roomItemsPickedSnapshot = (): ((item: string) => boolean) =>
  pickedNow

export function noteRoomItemPicked(item: string): void {
  if (roomItemPicked(item)) return
  try {
    flags().set(`picked:${item}`, true)
  } catch {}
  notePickedChanged()
}

export function forgetFoundSecrets(): void {
  try {
    flags().clearAll()
  } catch {}
  notePickedChanged()
}
