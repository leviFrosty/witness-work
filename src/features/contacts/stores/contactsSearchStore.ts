import { create } from 'zustand'

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
