import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'
import type { RoomItemId } from '@/types/pet'

/** One room item or hat that opened up, and when. */
export type PetUnlock = { item: RoomItemId; at: number }

/** The most kept; older news goes first. */
export const MAX_PET_UNLOCK_NEWS = 12

type PetUnlockNewsState = {
  /** Opened up and not looked at yet, oldest first. */
  unseen: PetUnlock[]
  /** The item whose full-screen reveal the User asked for (not persisted). */
  revealing: RoomItemId | null
  /**
   * Items the User's own action just opened up, waiting for
   * `PetUnlockRevealHost` to show their toasts (not persisted).
   */
  toasting: PetUnlockToasts | null
}

/** Items to show unlock toasts for, and until when they may still show. */
export type PetUnlockToasts = {
  items: RoomItemId[]
  petName: string
  expiresAt: number
}

/**
 * The pet's unlock news on this device (`docs/toasts.md`): room items and hats
 * that opened up and that the User hasn't opened, swiped away, or seen in
 * Decorate Room. The notifications tray lists them; the unlock toast, the tray
 * and Decorate Room settle them. Per device, like the tray itself: another
 * device hears about an item when it opens up there.
 */
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

/** Notes items that just opened up. */
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

/** Settles items: opened, swiped away, dismissed, or seen. */
export function settlePetUnlocks(items: readonly RoomItemId[]) {
  usePetUnlockNews.setState(({ unseen }) => {
    const left = unseen.filter((u) => !items.includes(u.item))
    return left.length === unseen.length ? {} : { unseen: left }
  })
}

/** Settles everything: Decorate Room shows it all. */
export const settleAllPetUnlocks = () =>
  usePetUnlockNews.setState(({ unseen }) =>
    unseen.length ? { unseen: [] } : {}
  )

/** Asks for an item's full-screen reveal. */
export const revealPetUnlock = (item: RoomItemId) =>
  usePetUnlockNews.setState({ revealing: item })

export const endPetUnlockReveal = () =>
  usePetUnlockNews.setState({ revealing: null })
