import { create } from 'zustand'
import type {
  GiftKind,
  PetVisit,
  Season,
  PetSpecies,
  TimeOfDay,
} from '@/types/pet'

export type PetCommand =
  | { kind: 'entrance' | 'trick' | 'twirl' | 'wake' | 'cheer' }
  | { kind: 'pat'; count: number }
  | { kind: 'scrub'; ms: number }

export type PetDevOverride = {
  hearts?: number
  dead?: boolean
  gold?: boolean
  goldStartedToday?: boolean

  rainbow?: boolean
  lampLevel?: number

  wallet?: number

  secrets?: boolean
  window?: { time: TimeOfDay; season: Season }
  paradise?: boolean
  star?: boolean
  gift?: GiftKind | null
  sill?: GiftKind[]

  visits?: PetVisit[] | null
}

type State = {
  entrance: PetSpecies | null

  command: (PetCommand & { id: number }) | null
  devOverride: PetDevOverride | null

  devSnapshot: Record<string, unknown> | null
}

let nextCommandId = 1

export const usePetSession = create<
  State & {
    requestEntrance: (species: PetSpecies) => void

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
