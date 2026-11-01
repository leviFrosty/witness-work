import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'
import type { RoomItemId } from '@/types/pet'

export type PetUnlock = { item: RoomItemId; at: number }

export const MAX_PET_UNLOCK_NEWS = 12

type PetUnlockNewsState = {
  unseen: PetUnlock[]

  revealing: RoomItemId | null

  toasting: PetUnlockToasts | null
}

export type PetUnlockToasts = {
  items: RoomItemId[]
  petName: string
  expiresAt: number
}

export const usePetUnlockNews = create<PetUnlockNewsState>()(
  persist(
    (): PetUnlockNewsState => ({ unseen: [], revealing: null, toasting: null }),
    {
      name: 'petUnlockNews',
      version: 1,
      migrate: keepPersistedState,
      storage: createJSONStorage(() => MmkvStorage),
      partialize: ({ unseen }) => ({ unseen }),
    }
  )
)

export function notePetUnlocks(items: readonly RoomItemId[], at = Date.now()) {
  if (!items.length) return
  usePetUnlockNews.setState(({ unseen }) => {
    const fresh = items.filter((item) => !unseen.some((u) => u.item === item))
    return {
      unseen: [...unseen, ...fresh.map((item) => ({ item, at }))].slice(
        -MAX_PET_UNLOCK_NEWS
      ),
    }
  })
}

export function settlePetUnlocks(items: readonly RoomItemId[]) {
  usePetUnlockNews.setState(({ unseen }) => {
    const left = unseen.filter((u) => !items.includes(u.item))
    return left.length === unseen.length ? {} : { unseen: left }
  })
}

export const settleAllPetUnlocks = () =>
  usePetUnlockNews.setState(({ unseen }) =>
    unseen.length ? { unseen: [] } : {}
  )

export const revealPetUnlock = (item: RoomItemId) =>
  usePetUnlockNews.setState({ revealing: item })

export const endPetUnlockReveal = () =>
  usePetUnlockNews.setState({ revealing: null })
