import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, combine, createJSONStorage } from "zustand/middleware";
import { Contact } from "../types/contact";

const initialState = {
  contacts: [] as Contact[],
  deletedContacts: [] as Contact[],
};

export const useContacts = create(
  persist(
    combine(initialState, (set) => ({
      set,
      addContact: (contact: Contact) =>
        set(({ contacts, deletedContacts }) => {
          const foundCurrentContact = contacts.find((c) => c.id === contact.id);
          const foundDeleteContact = deletedContacts.find(
            (delC) => delC.id === contact.id
          );

          if (foundCurrentContact || foundDeleteContact) {
            return {};
          }

          return {
            contacts: [...contacts, contact],
          };
        }),
      deleteContact: (id: string) =>
        set(({ contacts, deletedContacts }) => {
          const foundContact = contacts.find((contact) => contact.id === id);
          if (!foundContact) {
            return {};
          }
          return {
            deletedContacts: [...deletedContacts, foundContact],
            contacts: contacts.filter((contact) => contact.id !== id),
          };
        }),
      updateContact: (contact: Partial<Contact>) => {
        set(({ contacts }) => {
          return {
            contacts: contacts.map((c) => {
              if (c.id !== contact.id) {
                return c;
              }
              return { ...c, ...contact };
            }),
          };
        });
      },
      _WARNING_forceDeleteContacts: () => set({ contacts: [] }),
      _WARNING_clearDeleted: () => set({ deletedContacts: [] }),
    })),
    {
      name: "contacts",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useContacts;
