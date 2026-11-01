import {
  CHECKBOX_DEFAULT_SIGN,
  DEFAULT_ROOM,
  isGiftKind,
  ROOM_PART_OPTIONS,
  resolveCoat,
  SEASONS,
  TIMES_OF_DAY,
  type PetRecord,
  type PetRoomRecord,
  type PetRoomSettings,
  type RoomWindow,
} from '@/types/pet'
import type { PublisherCapabilities } from '@/lib/publisherCapabilities'

const CHECKBOX_DEFAULT_ROOM: PetRoomSettings = {
  ...DEFAULT_ROOM,
  sign: CHECKBOX_DEFAULT_SIGN,
}

export function defaultRoomFor(
  entryMode: PublisherCapabilities['entryMode']
): PetRoomSettings {
  return entryMode === 'checkbox' ? CHECKBOX_DEFAULT_ROOM : DEFAULT_ROOM
}

export function readPet(pet: PetRecord): PetRecord {
  const coat = resolveCoat(pet.species, pet.coat)
  const storedWakes: unknown = pet.wakes
  const storedKeepsakes: unknown = pet.keepsakes
  const wakes = Array.isArray(storedWakes)
    ? storedWakes.filter((day): day is string => typeof day === 'string')
    : []
  const keepsakes = Array.isArray(storedKeepsakes)
    ? (storedKeepsakes as PetRecord['keepsakes']).filter(
        (keepsake) =>
          !!keepsake &&
          typeof keepsake.on === 'string' &&
          isGiftKind(keepsake.kind)
      )
    : []
  const unchanged = (list: unknown[], stored: unknown) =>
    Array.isArray(stored) && list.length === stored.length
  if (
    coat === pet.coat &&
    unchanged(wakes, storedWakes) &&
    unchanged(keepsakes, storedKeepsakes)
  )
    return pet
  return { ...pet, coat, wakes, keepsakes }
}

const pick = <T extends string>(
  options: readonly T[],
  value: unknown,
  fallback: T
): T =>
  typeof value === 'string' && (options as readonly string[]).includes(value)
    ? (value as T)
    : fallback

export function readRoom(
  room: PetRoomRecord | null,
  defaults: PetRoomSettings
): PetRoomSettings {
  if (!room) return defaults
  const window: RoomWindow = {
    time: pick(
      ['live', ...TIMES_OF_DAY],
      room.window?.time,
      defaults.window.time
    ),
    season: pick(
      ['live', ...SEASONS],
      room.window?.season,
      defaults.window.season
    ),
  }
  return {
    window,
    wallColor: pick(
      ROOM_PART_OPTIONS.wallColor,
      room.wallColor,
      defaults.wallColor
    ),
    wallPattern: pick(
      ROOM_PART_OPTIONS.wallPattern,
      room.wallPattern,
      defaults.wallPattern
    ),
    floor: pick(ROOM_PART_OPTIONS.floor, room.floor, defaults.floor),
    bed: pick(ROOM_PART_OPTIONS.bed, room.bed, defaults.bed),
    shelf: pick(ROOM_PART_OPTIONS.shelf, room.shelf, defaults.shelf),
    lamp: pick(ROOM_PART_OPTIONS.lamp, room.lamp, defaults.lamp),
    sign: pick(ROOM_PART_OPTIONS.sign, room.sign, defaults.sign),
    hat: pick(ROOM_PART_OPTIONS.hat, room.hat, defaults.hat),
  }
}
