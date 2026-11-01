import { syncTimestamp } from '@/lib/syncClock'
import { stampPastTombstone } from '@/lib/syncTombstones'
import { create } from 'zustand'
import { combine, createJSONStorage } from 'zustand/middleware'
import { persist } from '@/stores/persist'
import { PersistStorage } from '@/stores/mmkv'
import {
  keptKeepsakes,
  keptPurchases,
  keptRoomItems,
  keptWakes,
} from '@/lib/petHistory'
import {
  DEFAULT_ROOM,
  PET_NAME_MAX_LENGTH,
  PET_RECORD_ID,
  PET_ROOM_RECORD_ID,
  resolveCoat,
  type GiftKind,
  type PetRecord,
  type PetRoomRecord,
  type PetRoomSettings,
  type PetSpecies,
  type PetPurchase,
  type PetTombstone,
  type RoomItemId,
} from '@/types/pet'

const initialState = {
  pet: null as PetRecord | null,

  room: null as PetRoomRecord | null,

  deletedPetRecords: [] as PetTombstone[],
}

type State = typeof initialState

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

export function cleanPetName(name: string | undefined): string | undefined {
  const trimmed = [...(name ?? '').trim()]
    .slice(0, PET_NAME_MAX_LENGTH)
    .join('')
    .trim()
  return trimmed || undefined
}

const newPetSeed = (): string =>
  Array.from({ length: 2 }, () =>
    Math.floor(Math.random() * 0x100000000)
      .toString(36)
      .padStart(7, '0')
  ).join('')

const stampFor = (state: State, id: string, previous?: number): number =>
  stampPastTombstone(state.deletedPetRecords, id, previous)

function editPet(
  state: State,
  change: (pet: PetRecord) => PetRecord | null
): Partial<State> {
  if (!state.pet) return {}
  const next = change(state.pet)
  if (!next) return {}
  return {
    pet: { ...next, updatedAt: stampFor(state, PET_RECORD_ID, next.updatedAt) },
  }
}

export const usePet = create(
  persist(
    combine(initialState, (set, get) => ({
      set,

      adopt: (args: {
        species: PetSpecies
        coat: string
        name?: string

        today: string
      }) =>
        set((state) => {
          if (state.pet || !DAY_KEY.test(args.today)) return {}
          const name = cleanPetName(args.name)
          return {
            pet: {
              id: PET_RECORD_ID,
              species: args.species,
              coat: resolveCoat(args.species, args.coat),
              ...(name ? { name } : {}),
              adoptedOn: args.today,
              wakes: [],
              keepsakes: [],
              seed: newPetSeed(),
              updatedAt: stampFor(state, PET_RECORD_ID),
            },
          }
        }),

      changeAppearance: ({
        species,
        coat,
      }: {
        species: PetSpecies
        coat: string
      }) =>
        set((state) =>
          editPet(state, (pet) => ({
            ...pet,
            species,
            coat: resolveCoat(species, coat),
          }))
        ),
      rename: (name: string | undefined) =>
        set((state) =>
          editPet(state, (pet) => {
            const { name: _old, ...rest } = pet
            const cleaned = cleanPetName(name)
            return cleaned ? { ...rest, name: cleaned } : rest
          })
        ),

      recordWake: (dayKey: string) =>
        set((state) =>
          editPet(state, (pet) => {
            if (!DAY_KEY.test(dayKey) || pet.wakes.includes(dayKey)) return null
            return { ...pet, wakes: keptWakes([...pet.wakes, dayKey]) }
          })
        ),

      collectKeepsake: (kind: GiftKind, dayKey: string) =>
        set((state) =>
          editPet(state, (pet) => {
            if (
              !DAY_KEY.test(dayKey) ||
              pet.keepsakes.some((keepsake) => keepsake.on === dayKey)
            )
              return null
            return {
              ...pet,
              keepsakes: keptKeepsakes([
                ...pet.keepsakes,
                { kind, on: dayKey },
              ]),
            }
          })
        ),

      earnRoomItems: (items: readonly RoomItemId[]): RoomItemId[] => {
        const { pet } = get()
        if (!pet) return []
        const added = [...new Set(items)].filter(
          (item) => !pet.earnedRoomItems?.includes(item)
        )
        if (added.length === 0) return []
        set((state) =>
          editPet(state, (pet) => ({
            ...pet,
            earnedRoomItems: keptRoomItems([
              ...(pet.earnedRoomItems ?? []),
              ...added,
            ]),
          }))
        )
        return added
      },

      buyRoomItem: (purchase: PetPurchase): boolean => {
        const { pet } = get()
        if (
          !pet ||
          !DAY_KEY.test(purchase.on) ||
          pet.earnedRoomItems?.includes(purchase.item) ||
          pet.purchases?.some((bought) => bought.item === purchase.item)
        )
          return false
        set((state) =>
          editPet(state, (pet) => ({
            ...pet,
            purchases: keptPurchases([...(pet.purchases ?? []), purchase]),
          }))
        )
        return true
      },

      updateRoom: (
        partial: Partial<PetRoomSettings>,
        defaults: PetRoomSettings = DEFAULT_ROOM
      ) =>
        set((state) => {
          const {
            id: _id,
            updatedAt,
            ...current
          } = state.room ?? {
            id: PET_ROOM_RECORD_ID,
            updatedAt: undefined,
            ...defaults,
          }
          return {
            room: {
              ...current,
              ...partial,
              window: { ...current.window, ...partial.window },
              id: PET_ROOM_RECORD_ID,
              updatedAt: stampFor(state, PET_ROOM_RECORD_ID, updatedAt),
            },
          }
        }),

      releaseCompanion: () =>
        set((state) => {
          const released = [state.pet, state.room].filter(
            (record): record is PetRecord | PetRoomRecord => record !== null
          )
          if (released.length === 0) return {}
          const tombstones = released.map((record) => ({
            id: record.id,
            deletedAt: syncTimestamp(record.updatedAt),
          }))
          const ids = new Set(tombstones.map((t) => t.id))
          return {
            pet: null,
            room: null,
            deletedPetRecords: [
              ...state.deletedPetRecords.filter((t) => !ids.has(t.id)),
              ...tombstones,
            ],
          }
        }),
      _WARNING_forceDeletePet: () => set(initialState),
    })),
    {
      name: 'petCompanion',
      storage: createJSONStorage(() => PersistStorage),
      version: 1,

      migrate: (persistedState) => persistedState as State,
    }
  )
)

export default usePet
