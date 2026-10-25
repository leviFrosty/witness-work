import useToday from '@/hooks/useToday'
import type { PetRecord, RoomWindow } from '@/types/pet'
import type { PlayerInput, SceneInput } from '@/features/pet/art'
import usePetLife, { type PetLifeState } from '@/features/pet/hooks/usePetLife'
import usePetSignData from '@/features/pet/hooks/usePetSignData'
import usePetWindow from '@/features/pet/hooks/usePetWindow'
import type { ResolvedWindow } from '@/features/pet/lib/liveWindow'
import { petDisplayName } from '@/features/pet/lib/names'
import {
  cardLife,
  petSceneInput,
  type PetCardLife,
} from '@/features/pet/lib/sceneInput'
import { usePetSession } from '@/features/pet/stores/petSession'

const NO_ROLL = { paradise: false, star: false }
const LIVE: RoomWindow = { time: 'live', season: 'live' }

export type PetRoomScene = {
  pet: PetRecord
  name: string
  /** Hearts and status, as the Home card's header shows them. */
  life: PetCardLife
  state: PetLifeState
  window: ResolvedWindow
  /** The clock's time and season, for the "Live" choices' pictures. */
  liveNow: ResolvedWindow
  /** The live preview: the Home card's room, without visitors or moments. */
  input: PlayerInput
  /** What every thumbnail shares: the sign's values, the lamp, the sill. */
  thumbBase: Omit<SceneInput, 'room'>
}

/**
 * The pet details sheet's room: the companion as Home shows it, but with no
 * visiting pet or rolled moment, so the preview shows only what the User chose.
 * Null without a companion.
 */
export default function usePetRoomScene(): PetRoomScene | null {
  const state = usePetLife()
  const override = usePetSession((s) => (__DEV__ ? s.devOverride : null))
  const sign = usePetSignData(useToday())
  const window = usePetWindow(state.room.window)
  const liveNow = usePetWindow(LIVE)
  const pet = state.pet
  if (!pet || !state.life) return null
  const life = cardLife(state.life, override)
  const { input } = petSceneInput({
    pet,
    life,
    room: state.room,
    window,
    lampLevel: state.lampLevel,
    sign,
    pendingGift: null,
    keepsakes: pet.keepsakes,
    visits: [],
    roll: NO_ROLL,
    override: override && {
      ...override,
      window: undefined,
      gift: null,
      paradise: false,
      star: false,
      rainbow: false,
    },
  })
  return {
    pet,
    name: petDisplayName(pet),
    life,
    state,
    window,
    liveNow,
    input,
    thumbBase: {
      sign,
      lampLevel: input.lampLevel,
      pet: input.pet,
      moments: { sill: input.moments?.sill },
    },
  }
}
