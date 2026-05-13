import { create } from 'zustand'

/**
 * Ephemeral search query for the Contacts tab. Lives in its own store (not
 * `usePreferences`) because the search screen is presented modally from the tab
 * — both the parent list and the search form need a single shared source of
 * truth for the query, but the value should NOT persist across app launches
 * like a setting would.
 */
type ContactsSearchState = {
  search: string
  setSearch: (value: string) => void
  reset: () => void
}

const useContactsSearchStore = create<ContactsSearchState>((set) => ({
  search: '',
  setSearch: (value) => set({ search: value }),
  reset: () => set({ search: '' }),
}))

export default useContactsSearchStore
