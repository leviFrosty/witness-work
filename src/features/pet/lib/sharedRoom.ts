import { hashString } from '@/lib/pixelArt'
import {
  DEFAULT_ROOM,
  HAT_IDS,
  resolveCoat,
  type HatId,
  type PetRoomSettings,
  type RoomWindow,
  type SharedPet,
} from '@/types/pet'
import { MAX_HEARTS } from '@/features/pet/lib/life'
import {
  resolveRoom,
  type PlayerInput,
  type SignData,
} from '@/features/pet/art'
import type { ResolvedWindow } from '@/features/pet/lib/liveWindow'

const NO_SIGN: SignData = {
  monthMinutes: 0,
  monthGoal: 0,
  yearBars: [],
  currentMonthIndex: 0,
  yearMinutes: 0,
  sharedMonths: [],
  planDay: null,
  planMinutes: null,
  conversations: 0,
  returnVisits: 0,
  digits: 'latn',
}

const isHat = (hat: string | undefined): hat is HatId =>
  hat !== undefined && (HAT_IDS as readonly string[]).includes(hat)

export const sharedRoomWindow = (pet: SharedPet): RoomWindow => ({
  time: pet.room?.time ?? 'live',
  season: pet.room?.season ?? 'live',
})

export function sharedRoomSettings(pet: SharedPet): PetRoomSettings {
  const room = pet.room
  return {
    window: sharedRoomWindow(pet),
    wallColor: room?.wallColor ?? DEFAULT_ROOM.wallColor,
    wallPattern: room?.wallPattern ?? DEFAULT_ROOM.wallPattern,
    floor: room?.floor ?? DEFAULT_ROOM.floor,
    bed: room?.bed ?? DEFAULT_ROOM.bed,
    shelf: room?.shelf ?? DEFAULT_ROOM.shelf,
    lamp: room?.lamp ?? DEFAULT_ROOM.lamp,
    study: room?.study ?? DEFAULT_ROOM.study,
    sign: 'none',
    hat: isHat(pet.hat) ? pet.hat : 'none',
  }
}

export function sharedRoomInput(
  pet: SharedPet,
  window: ResolvedWindow,
  seedKey: string
): PlayerInput {
  return {
    room: resolveRoom(sharedRoomSettings(pet), window),
    sign: NO_SIGN,
    lampLevel: MAX_HEARTS,
    pet: {
      species: pet.species,
      coat: resolveCoat(pet.species, pet.coat),
      mood: 'happy',
      seed: hashString(seedKey) % 100_000,
    },
    visitors: [],
    ...(pet.hatGrowth === undefined
      ? {}
      : { hatLife: { growth: pet.hatGrowth } }),
  }
}
