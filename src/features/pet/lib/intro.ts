import {
  HAT_UNLOCK_ORDER,
  UNLOCK_ORDER,
  type PetRoomSettings,
} from '@/types/pet'

/**
 * The adoption intro: three short steps shown in the picker sheet right after
 * Adopt, each with the new pet in a room.
 */
export const INTRO_STEPS = ['hearts', 'shop', 'decorate'] as const
export type IntroStep = (typeof INTRO_STEPS)[number]

/** The hat the intro's last step tries on: the first one to open up. */
export const INTRO_HAT = HAT_UNLOCK_ORDER[0].split(
  ':'
)[1] as PetRoomSettings['hat']

/**
 * `room` with every part set to the last item to open up (and the last hat): a
 * room the Shop can furnish, for the intro's preview.
 */
export function fullyUnlockedRoom(room: PetRoomSettings): PetRoomSettings {
  const last: Record<string, string> = {}
  for (const item of [...UNLOCK_ORDER, ...HAT_UNLOCK_ORDER]) {
    const [part, option] = item.split(':')
    last[part] = option
  }
  return { ...room, ...last } as PetRoomSettings
}
