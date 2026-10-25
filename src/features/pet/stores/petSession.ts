import { create } from 'zustand'
import type {
  GiftKind,
  PetVisit,
  Season,
  PetSpecies,
  TimeOfDay,
} from '@/types/pet'

/** A motion or pat asked of the mounted Home card (dev harness). */
export type PetCommand =
  | { kind: 'entrance' | 'trick' | 'twirl' | 'wake' | 'cheer' }
  | { kind: 'pat'; count: number }
  | { kind: 'scrub'; ms: number }

/**
 * Dev-only overrides applied on top of the real life and room (the dev harness,
 * `__WW_DEV__.pet.override`). Never set in production builds.
 */
export type PetDevOverride = {
  /** 0–5 in half steps; 0 reads as died unless `dead` says otherwise. */
  hearts?: number
  dead?: boolean
  gold?: boolean
  goldStartedToday?: boolean
  /** The rainbow, still hidden in a night sky. */
  rainbow?: boolean
  lampLevel?: number
  /**
   * The raw Service Streak count room unlocks read, as if the User had a streak
   * to grow. Items it opens are shown, never stored.
   */
  streak?: number
  /** Every secret item opens up, shown, never stored. */
  secrets?: boolean
  window?: { time: TimeOfDay; season: Season }
  paradise?: boolean
  star?: boolean
  gift?: GiftKind | null
  sill?: GiftKind[]
  /** Buddies' pets visiting, in place of today's real ones. */
  visits?: PetVisit[] | null
}

type State = {
  /** An entrance to play the next time the Home card is on screen. */
  entrance: PetSpecies | null
  /** The latest command for the Home card; `id` tells repeats apart. */
  command: (PetCommand & { id: number }) | null
  devOverride: PetDevOverride | null
  /** What the Home card last drew (dev builds), for `__WW_DEV__.pet.state()`. */
  devSnapshot: Record<string, unknown> | null
}

let nextCommandId = 1

/**
 * In-memory Pet Companion session state: nothing here is persisted or synced.
 * The picker asks for an entrance; the Home card plays it once.
 */
export const usePetSession = create<
  State & {
    requestEntrance: (species: PetSpecies) => void
    /** The pending entrance, cleared; null when none. */
    takeEntrance: () => PetSpecies | null
    send: (command: PetCommand) => number
    setDevOverride: (override: PetDevOverride | null) => void
    setDevSnapshot: (snapshot: Record<string, unknown> | null) => void
  }
>((set, get) => ({
  entrance: null,
  command: null,
  devOverride: null,
  devSnapshot: null,
  requestEntrance: (species) => set({ entrance: species }),
  takeEntrance: () => {
    const { entrance } = get()
    if (entrance) set({ entrance: null })
    return entrance
  },
  send: (command) => {
    const id = nextCommandId++
    set({ command: { ...command, id } })
    return id
  },
  setDevOverride: (devOverride) => set({ devOverride }),
  setDevSnapshot: (devSnapshot) => set({ devSnapshot }),
}))

export default usePetSession
