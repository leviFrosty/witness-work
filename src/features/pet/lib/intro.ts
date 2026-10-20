import type { StreakKind } from '@/lib/serviceStreak'
import {
  HAT_UNLOCK_ORDER,
  UNLOCK_ORDER,
  type PetRoomSettings,
} from '@/types/pet'
import type { UnlockMode } from '@/features/pet/lib/unlocks'

/**
 * The adoption intro: three short steps shown in the picker sheet right after
 * Adopt, each with the new pet in a room.
 */
export const INTRO_STEPS = ['hearts', 'streak', 'decorate'] as const
export type IntroStep = (typeof INTRO_STEPS)[number]

/** The hat the intro's last step tries on: the first one to open up. */
export const INTRO_HAT = HAT_UNLOCK_ORDER[0].split(
  ':'
)[1] as PetRoomSettings['hat']

/**
 * `room` with every part set to the last item to open up (and the last hat):
 * the room a long streak earns, for the intro's preview.
 */
export function fullyUnlockedRoom(room: PetRoomSettings): PetRoomSettings {
  const last: Record<string, string> = {}
  for (const item of [...UNLOCK_ORDER, ...HAT_UNLOCK_ORDER]) {
    const [part, option] = item.split(':')
    last[part] = option
  }
  return { ...room, ...last } as PetRoomSettings
}

/** Which way the streak step explains how items open up. */
export function introStreakCopy(
  mode: UnlockMode,
  kind: StreakKind
): 'plans' | 'months' | 'noStreak' {
  if (mode === 'months') return 'noStreak'
  return kind === 'plans' ? 'plans' : 'months'
}
