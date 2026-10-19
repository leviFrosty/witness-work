import usePet from '@/stores/pet'
import {
  PET_RECORD_ID,
  PET_ROOM_RECORD_ID,
  type PetSnapshot,
} from '@/types/pet'

/** The local pet store's synced fields, as lists that merge by id. */
export function localPetSnapshot(): PetSnapshot {
  const { pet, room, deletedPetRecords } = usePet.getState()
  return {
    pets: pet ? [pet] : [],
    petRooms: room ? [room] : [],
    deletedPetRecords,
  }
}

/** Writes a merged or restored snapshot back, preserving its stamps verbatim. */
export function applyPetSnapshot(snapshot: PetSnapshot): void {
  usePet.setState({
    pet: snapshot.pets.find((pet) => pet.id === PET_RECORD_ID) ?? null,
    room:
      snapshot.petRooms.find((room) => room.id === PET_ROOM_RECORD_ID) ?? null,
    deletedPetRecords: snapshot.deletedPetRecords,
  })
}

export function hasPetData(): boolean {
  return Object.values(localPetSnapshot()).some((list) => list.length > 0)
}
