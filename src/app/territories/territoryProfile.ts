import { deriveInboxId } from '@/features/buddies/lib/keys'
import type {
  SharedCarProfile,
  SharedCarProfileProvider,
} from '@/app/sharedCars/profile'
import { TerritorySharingError } from '@/app/territories/engine/types'

export type TerritoryProfileDeps = {
  buddies: SharedCarProfileProvider
  buddiesStarted: () => boolean
  accountKey: () => Promise<Uint8Array | null>
  name: () => string
}

export function createTerritoryProfile(
  deps: TerritoryProfileDeps
): SharedCarProfileProvider {
  return async (): Promise<SharedCarProfile> => {
    if (deps.buddiesStarted()) return deps.buddies()
    const seed = await deps.accountKey()
    if (!seed) throw new TerritorySharingError('no_account_key')
    return { name: deps.name(), inboxId: deriveInboxId(seed) }
  }
}
