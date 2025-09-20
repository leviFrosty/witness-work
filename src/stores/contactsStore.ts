import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { persist, combine, createJSONStorage } from 'zustand/middleware'
import { Contact } from '../types/contact'
import { hasMigratedFromAsyncStorage, MmkvStorage } from './mmkv'

const initialState = {
  contacts: [] as Contact[],
  deletedContacts: [] as Contact[],
}

export const useContacts = create(
  persist(
    combine(initialState, (set) => ({
      set,
      addContact: (contact: Contact) =>
        set(({ contacts, deletedContacts }) => {
          const foundCurrentContact = contacts.find((c) => c.id === contact.id)
          const foundDeleteContact = deletedContacts.find(
            (delC) => delC.id === contact.id
          )

          if (foundCurrentContact || foundDeleteContact) {
            return { contacts, deletedContacts }
          }

          return {
            contacts: [...contacts, contact],
          }
        }),
      deleteContact: (id: string) =>
        set(({ contacts, deletedContacts }) => {
          const foundContact = contacts.find((contact) => contact.id === id)
          if (!foundContact) {
            return { contacts, deletedContacts }
          }
          return {
            deletedContacts: [...deletedContacts, foundContact],
            contacts: contacts.filter((contact) => contact.id !== id),
          }
        }),
      updateContact: (contact: Partial<Contact>) => {
        set(({ contacts }) => {
          return {
            contacts: contacts.map((c) => {
              if (c.id !== contact.id) {
                return c
              }
              return { ...c, ...contact }
            }),
          }
        })
      },
      deleteFieldFromAllContacts: (field: string) => {
        set(({ contacts }) => {
          return {
            contacts: contacts.map((c) => {
              if (
                c.customFields === undefined ||
                c.customFields[field] === undefined
              ) {
                return c // If customFields or selected field doesn't exist, return original contact
              }

              const fields = { ...c.customFields }
              delete fields[field]
              return { ...c, customFields: fields } // Otherwise delete field and set object value
            }),
          }
        })
      },
      recoverContact: (id: string) => {
        set(({ contacts, deletedContacts }) => {
          const recoverContact = deletedContacts.find((dC) => dC.id === id)
          if (!recoverContact) {
            return { contacts, deletedContacts }
          }

          return {
            deletedContacts: deletedContacts.filter((dC) => dC.id !== id),
            contacts: [...contacts, recoverContact],
          }
        })
      },
      removeDeletedContact: (id: string) => {
        set(({ deletedContacts }) => {
          return {
            deletedContacts: deletedContacts.filter((dC) => dC.id !== id),
          }
        })
      },
      dismissContact: (
        id: string,
        dismissedUntil: Date,
        dismissedNotificationId?: string
      ) => {
        set(({ contacts }) => {
          return {
            contacts: contacts.map((c) => {
              if (c.id !== id) {
                return c
              }
              return { ...c, dismissedUntil, dismissedNotificationId }
            }),
          }
        })
      },
      undismissContact: (id: string) => {
        set(({ contacts }) => {
          return {
            contacts: contacts.map((c) => {
              if (c.id !== id) {
                return c
              }
              const updatedContact = { ...c }
              delete updatedContact.dismissedUntil
              delete updatedContact.dismissedNotificationId
              return updatedContact
            }),
          }
        })
      },
      _WARNING_forceDeleteContacts: () => set({ contacts: [] }),
      _WARNING_clearDeleted: () => set({ deletedContacts: [] }),
    })),
    {
      name: 'contacts',
      storage: createJSONStorage(() =>
        hasMigratedFromAsyncStorage() ? MmkvStorage : AsyncStorage
      ),
    }
  )
)

export default useContacts
