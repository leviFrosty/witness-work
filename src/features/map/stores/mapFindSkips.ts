import { create } from 'zustand'
import { combine, createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { PersistStorage } from '@/stores/mmkv'
import useContacts from '@/stores/contactsStore'
import {
  contactsToFind,
  pinLookupKey,
} from '@/features/map/lib/geocodeContacts'

export const useMapFindSkips = create(
  persist(
    combine({ skipped: [] as string[] }, (set) => ({
      skip: (keys: string[], keep: (key: string) => boolean) =>
        set(({ skipped }) => ({
          skipped: [...new Set([...skipped.filter(keep), ...keys])],
        })),
    })),
    {
      name: 'map-find-skips',
      storage: createJSONStorage(() => PersistStorage),
      version: 0,
      migrate: keepPersistedState,
    }
  )
)

export function skipPinLookups(keys: string[]) {
  const missing = new Set(
    contactsToFind(useContacts.getState().contacts, new Set()).map(pinLookupKey)
  )
  useMapFindSkips.getState().skip(keys, (key) => missing.has(key))
}
