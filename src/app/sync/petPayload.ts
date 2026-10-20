import type { SyncPayload } from '@/app/sync/payload'
import type { PetRecord, PetRoomRecord, PetSnapshot } from '@/types/pet'

/** A payload's pet slice, defaulting every list for older writers. */
export function petFromPayload(payload: SyncPayload): PetSnapshot {
  const slice = payload.petStore
  return {
    pets: (slice?.pets ?? []) as PetRecord[],
    petRooms: (slice?.petRooms ?? []) as PetRoomRecord[],
    deletedPetRecords: slice?.deletedPetRecords ?? [],
  }
}
