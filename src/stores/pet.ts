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
  /** The User's companion; null until adopted or after it's released. */
  pet: null as PetRecord | null,
  /** The room's choices; null until first customized (defaults apply). */
  room: null as PetRoomRecord | null,
  /** Tombstones for the pet and room records, so a release syncs. */
  deletedPetRecords: [] as PetTombstone[],
}

type State = typeof initialState

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

/** Trimmed, at most `PET_NAME_MAX_LENGTH` characters; empty is no name. */
export function cleanPetName(name: string | undefined): string | undefined {
  const trimmed = [...(name ?? '').trim()]
    .slice(0, PET_NAME_MAX_LENGTH)
    .join('')
    .trim()
  return trimmed || undefined
}

/** A new pet's gift seed: random, not secret (`PetRecord.seed`). */
const newPetSeed = (): string =>
  Array.from({ length: 2 }, () =>
    Math.floor(Math.random() * 0x100000000)
      .toString(36)
      .padStart(7, '0')
  ).join('')

/**
 * A stamp newer than the record's last edit and any tombstone for its id. The
 * tombstone stays: the merge uses it to tell a released companion's history
 * from this one's.
 */
const stampFor = (state: State, id: string, previous?: number): number =>
  stampPastTombstone(state.deletedPetRecords, id, previous)

/** Applies `change` to the pet and restamps it; no pet, no change. */
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

/**
 * Persisted store for the Pet Companion: one pet record and one room record.
 * Sync-aware like `mileage`: every mutation stamps `updatedAt`, and releasing
 * the companion leaves tombstones. Hearts are never stored; they're replayed
 * from ministry records (`src/features/pet/lib/life.ts`, ADR 0030).
 */
export const usePet = create(
  persist(
    combine(initialState, (set, get) => ({
      set,
      /** Adopts the companion. Does nothing while one already exists. */
      adopt: (args: {
        species: PetSpecies
        coat: string
        name?: string
        /** Local day key of the adoption. */
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
      /** Change Pet: new species and coat, same companion. */
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
      /** Records a wake tap on `dayKey` (`keptWakes` trims the list). */
      recordWake: (dayKey: string) =>
        set((state) =>
          editPet(state, (pet) => {
            if (!DAY_KEY.test(dayKey) || pet.wakes.includes(dayKey)) return null
            return { ...pet, wakes: keptWakes([...pet.wakes, dayKey]) }
          })
        ),
      /**
       * Keeps the gift left on `dayKey` (its gift day). Once per day; the
       * newest 20 are kept (`keptKeepsakes`).
       */
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
      /**
       * Stores room items the pet just earned, so they stay unlocked whatever
       * the streak does next. Returns the ones that weren't stored yet (none
       * without a pet), so a second caller with the same items adds nothing.
       */
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
      /**
       * Records buying `item` in the Shop for `price` of `currency` on `dayKey`
       * (ADR 0035). Whether it's affordable is the caller's to check; an item
       * already bought or earned isn't bought again. Returns whether it was.
       */
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
      /**
       * Changes some of the room's choices. `defaults` fills the rest while the
       * room was never customized; pass the room as shown (its sign default
       * depends on the Publisher's entry mode).
       */
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
      /** Releases the companion with its room, on every synced device. */
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
      // No earlier shapes yet; later versions migrate from here.
      migrate: (persistedState) => persistedState as State,
    }
  )
)

export default usePet
