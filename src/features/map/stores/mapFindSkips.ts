import { create } from 'zustand'
import { persist, combine, createJSONStorage } from 'zustand/middleware'
import { PersistStorage } from '@/stores/mmkv'
import useContacts from '@/stores/contactsStore'
import {
  contactsToFind,
  pinLookupKey,
} from '@/features/map/lib/geocodeContacts'

/**
 * Addresses the Map's "Find contacts" row no longer offers: the lookup had no
 * match, or the user hid the row. Keys from `pinLookupKey`, so an edited
 * address is offered again. On this device only: never synced or backed up, and
 * it holds hashes, never addresses.
 */
export const useMapFindSkips = create(
  persist(
    combine({ skipped: [] as string[] }, (set) => ({
      /**
       * Adds `keys`, and drops earlier keys that `keep` no longer matches
       * (Contacts since pinned, deleted or edited), so the list stays small.
       */
      skip: (keys: string[], keep: (key: string) => boolean) =>
        set(({ skipped }) => ({
          skipped: [...new Set([...skipped.filter(keep), ...keys])],
        })),
    })),
    {
      name: 'map-find-skips',
      storage: createJSONStorage(() => PersistStorage),
      version: 0,
    }
  )
)

/**
 * Stops offering the addresses with these `pinLookupKey`s, and forgets the
 * Contacts that no longer need finding.
 */
export function skipPinLookups(keys: string[]) {
  const missing = new Set(
    contactsToFind(useContacts.getState().contacts, new Set()).map(pinLookupKey)
  )
  useMapFindSkips.getState().skip(keys, (key) => missing.has(key))
}
