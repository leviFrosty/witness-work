import { create } from 'zustand'
import { combine, createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { PersistStorage } from '@/stores/mmkv'
import type { Contact } from '@/types/contact'
import { type GeocodeRetry, withGeocodeRetry } from '@/lib/geocodeRetry'

/**
 * Contacts whose address lookup failed when they were saved, waiting to be
 * looked up again (`src/app/contacts/geocodeRetry.ts`). On this device only:
 * never synced or backed up, and it holds ids and hashes, never addresses.
 */
export const useGeocodeRetry = create(
  persist(
    combine({ queue: [] as GeocodeRetry[] }, (set) => ({
      enqueue: (contact: Pick<Contact, 'id' | 'address' | 'coordinate'>) =>
        set(({ queue }) => ({ queue: withGeocodeRetry(queue, contact) })),
      /**
       * Replaces `entry` with `next`, or removes it when `next` is null. Does
       * nothing once a newer retry for the same Contact has taken its place.
       */
      settle: (entry: GeocodeRetry, next: GeocodeRetry | null) =>
        set(({ queue }) => ({
          queue: queue.flatMap((item) =>
            item.contactId === entry.contactId && item.key === entry.key
              ? next
                ? [next]
                : []
              : [item]
          ),
        })),
      clear: () => set({ queue: [] }),
    })),
    {
      name: 'geocode-retry',
      storage: createJSONStorage(() => PersistStorage),
      version: 0,
      migrate: keepPersistedState,
    }
  )
)
