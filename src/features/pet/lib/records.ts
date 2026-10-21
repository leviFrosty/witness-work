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

/**
 * Synced pet records keep values this build may not know (a coat, room option
 * or gift from a newer version) so they round-trip. These read them for
 * display, falling back to defaults.
 */

const CHECKBOX_DEFAULT_ROOM: PetRoomSettings = {
  ...DEFAULT_ROOM,
  sign: CHECKBOX_DEFAULT_SIGN,
}

/**
 * The room a companion starts with. A Kingdom Publisher's sign shows shared
 * months (checkbox entry mode). The same object each time, so callers can
 * compare it.
 */
export function defaultRoomFor(
  entryMode: PublisherCapabilities['entryMode']
): PetRoomSettings {
  return entryMode === 'checkbox' ? CHECKBOX_DEFAULT_ROOM : DEFAULT_ROOM
}

/**
 * The pet with its coat checked against its species, unknown gifts dropped, and
 * missing wake or keepsake lists (a hand-edited or damaged record) read as
 * empty. The same object when nothing needed fixing.
 */
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

/** The room's choices, each unknown one replaced by its default. */
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
