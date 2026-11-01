import {
  HAT_UNLOCK_ORDER,
  UNLOCK_ORDER,
  type PetRoomSettings,
} from '@/types/pet'

export const INTRO_STEPS = ['hearts', 'shop', 'decorate'] as const
export type IntroStep = (typeof INTRO_STEPS)[number]

export const INTRO_HAT = HAT_UNLOCK_ORDER[0].split(
  ':'
)[1] as PetRoomSettings['hat']

export function fullyUnlockedRoom(room: PetRoomSettings): PetRoomSettings {
  const last: Record<string, string> = {}
  for (const item of [...UNLOCK_ORDER, ...HAT_UNLOCK_ORDER]) {
    const [part, option] = item.split(':')
    last[part] = option
  }
  return { ...room, ...last } as PetRoomSettings
}
