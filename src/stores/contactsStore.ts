import { create } from 'zustand'
import { persist, combine, createJSONStorage } from 'zustand/middleware'
import * as Crypto from 'expo-crypto'
import { Contact } from '@/types/contact'
import {
  CustomFieldDefinition,
  CustomFieldTombstone,
} from '@/types/customField'
import {
  stripTombstonedCustomFieldValues,
  stripTombstonedCustomFields,
} from '@/lib/customFields'
import {
  GuardedAsyncStorage,
  hasMigratedFromAsyncStorage,
  MmkvStorage,
} from '@/stores/mmkv'

const initialState = {
  contacts: [] as Contact[],
  deletedContacts: [] as Contact[],
  /**
   * Definitions for the user-customizable contact fields. Identified by stable
   * UUIDs — contact `customFields` records reference these ids, so rename /
   * reorder / archive operations don't touch contact data.
   */
  customFieldDefs: [] as CustomFieldDefinition[],
  deletedCustomFieldDefs: [] as CustomFieldTombstone[],
}

export const useContacts = create(
  persist(
    combine(initialState, (set) => ({
      set,
      addContact: (contact: Contact) =>
        set(({ contacts, deletedContacts, deletedCustomFieldDefs }) => {
          const foundCurrentContact = contacts.find((c) => c.id === contact.id)
          const foundDeleteContact = deletedContacts.find(
            (delC) => delC.id === contact.id
          )

          if (foundCurrentContact || foundDeleteContact) {
            return { contacts, deletedContacts }
          }

          return {
            contacts: [
              ...contacts,
              stripTombstonedCustomFields(
                { ...contact, updatedAt: Date.now() },
                deletedCustomFieldDefs
              ),
            ],
          }
        }),
      deleteContact: (id: string) =>
        set(({ contacts, deletedContacts }) => {
          const foundContact = contacts.find((contact) => contact.id === id)
          if (!foundContact) {
            return { contacts, deletedContacts }
          }
          return {
            deletedContacts: [
              ...deletedContacts,
              { ...foundContact, updatedAt: Date.now() },
            ],
            contacts: contacts.filter((contact) => contact.id !== id),
          }
        }),
      updateContact: (contact: Partial<Contact>) => {
        set(({ contacts, deletedCustomFieldDefs }) => {
          const updatedCustomFields = stripTombstonedCustomFieldValues(
            contact.customFields,
            deletedCustomFieldDefs
          )

          return {
            contacts: contacts.map((c) => {
              if (c.id !== contact.id) {
                return c
              }
              return {
                ...c,
                ...contact,
                ...(contact.customFields
                  ? { customFields: updatedCustomFields }
                  : {}),
                updatedAt: Date.now(),
              }
            }),
          }
        })
      },
      /**
       * Adds a new custom field definition. Trims the label and rejects empties
       *
       * - Case-sensitive duplicates of existing non-archived defs. Returns the
       *   new def (or the existing one when a duplicate label is detected) so
       *   callers can avoid clobbering form state with a stale id.
       */
      addCustomFieldDef: (label: string): CustomFieldDefinition | null => {
        const trimmed = label.trim()
        if (!trimmed) return null
        let result: CustomFieldDefinition | null = null
        set(({ customFieldDefs }) => {
          const existing = customFieldDefs.find(
            (d) => !d.archived && d.label === trimmed
          )
          if (existing) {
            result = existing
            return { customFieldDefs }
          }
          const now = Date.now()
          const def: CustomFieldDefinition = {
            id: Crypto.randomUUID(),
            label: trimmed,
            order: nextOrder(customFieldDefs),
            createdAt: now,
            updatedAt: now,
          }
          result = def
          return { customFieldDefs: [...customFieldDefs, def] }
        })
        return result
      },
      renameCustomFieldDef: (id: string, label: string) => {
        const trimmed = label.trim()
        if (!trimmed) return
        set(({ customFieldDefs }) => ({
          customFieldDefs: customFieldDefs.map((d) =>
            d.id === id ? { ...d, label: trimmed, updatedAt: Date.now() } : d
          ),
        }))
      },
      /**
       * Reorders the active (non-archived) defs. `orderedIds` is the new active
       * sequence; archived defs keep their existing relative order, slotted
       * after the active list. `order` is rewritten on every active def so sync
       * merges have a clean per-def timestamp + position to compare.
       */
      reorderCustomFieldDefs: (orderedIds: string[]) => {
        set(({ customFieldDefs }) => {
          const now = Date.now()
          const byId = new Map(customFieldDefs.map((d) => [d.id, d]))
          const archived = customFieldDefs.filter((d) => d.archived)
          const reorderedActive: CustomFieldDefinition[] = []
          orderedIds.forEach((id, idx) => {
            const def = byId.get(id)
            if (!def || def.archived) return
            const next: CustomFieldDefinition = {
              ...def,
              order: idx,
              updatedAt: def.order === idx ? def.updatedAt : now,
            }
            reorderedActive.push(next)
          })
          // Preserve archived defs as-is, ordered after active.
          archived.forEach((d, i) => {
            archived[i] = { ...d, order: orderedIds.length + i }
          })
          return {
            customFieldDefs: [...reorderedActive, ...archived],
          }
        })
      },
      archiveCustomFieldDef: (id: string) => {
        set(({ customFieldDefs }) => ({
          customFieldDefs: customFieldDefs.map((d) =>
            d.id === id ? { ...d, archived: true, updatedAt: Date.now() } : d
          ),
        }))
      },
      restoreCustomFieldDef: (id: string) => {
        set(({ customFieldDefs }) => {
          const target = customFieldDefs.find((d) => d.id === id)
          if (!target || !target.archived) return { customFieldDefs }
          // Slot restored def at the end of the active list.
          const activeCount = customFieldDefs.filter((d) => !d.archived).length
          const now = Date.now()
          return {
            customFieldDefs: customFieldDefs.map((d) =>
              d.id === id
                ? { ...d, archived: false, order: activeCount, updatedAt: now }
                : d
            ),
          }
        })
      },
      /**
       * Permanently removes a custom field definition AND every contact's value
       * for that field. Destructive; callers should expose it only from a
       * confirmation flow for an already archived definition.
       */
      purgeCustomFieldDef: (id: string) => {
        set(
          ({
            contacts,
            deletedContacts,
            customFieldDefs,
            deletedCustomFieldDefs,
          }) => {
            const target = customFieldDefs.find((d) => d.id === id)
            if (!target || !target.archived) {
              return {
                customFieldDefs,
                deletedCustomFieldDefs,
              }
            }

            const deletedAt = Date.now()
            const tombstone: CustomFieldTombstone = { id, deletedAt }
            const tombstones = [
              ...deletedCustomFieldDefs.filter((t) => t.id !== id),
              tombstone,
            ]

            return {
              customFieldDefs: customFieldDefs.filter((d) => d.id !== id),
              deletedCustomFieldDefs: tombstones,
              contacts: contacts.map((c) =>
                stripTombstonedCustomFields(c, [tombstone], deletedAt)
              ),
              deletedContacts: deletedContacts.map((c) =>
                stripTombstonedCustomFields(c, [tombstone], deletedAt)
              ),
            }
          }
        )
      },
      /**
       * Removes a definition while undoing an import. Import undo is an
       * explicit local rollback, so it must not create a sync tombstone that
       * would block the same deterministic import from being re-run later.
       */
      removeCustomFieldDefForUndo: (id: string) => {
        set(
          ({
            contacts,
            deletedContacts,
            customFieldDefs,
            deletedCustomFieldDefs,
          }) => {
            const removed = customFieldDefs.some((d) => d.id === id)
            if (!removed) return { customFieldDefs, deletedCustomFieldDefs }
            const updatedAt = Date.now()
            const rollbackTombstone = { id, deletedAt: updatedAt }
            return {
              customFieldDefs: customFieldDefs.filter((d) => d.id !== id),
              deletedCustomFieldDefs: deletedCustomFieldDefs.filter(
                (tombstone) => tombstone.id !== id
              ),
              contacts: contacts.map((c) =>
                stripTombstonedCustomFields(c, [rollbackTombstone], updatedAt)
              ),
              deletedContacts: deletedContacts.map((c) =>
                stripTombstonedCustomFields(c, [rollbackTombstone], updatedAt)
              ),
            }
          }
        )
      },
      /**
       * Adds any defs from `incoming` whose id isn't already present locally.
       * Used by share-link import: the recipient's local defs always win on
       * label conflicts, but unknown ids referenced by the imported contact
       * still need a definition so the data renders. Permanently tombstoned ids
       * remain blocked so stale exports cannot resurrect them.
       */
      mergeIncomingCustomFieldDefs: (incoming: CustomFieldDefinition[]) => {
        if (incoming.length === 0) return
        set(({ customFieldDefs, deletedCustomFieldDefs }) => {
          const existingIds = new Set(customFieldDefs.map((d) => d.id))
          const deletedIds = new Set(
            deletedCustomFieldDefs.map((tombstone) => tombstone.id)
          )
          const additions = incoming.filter(
            (d) => !existingIds.has(d.id) && !deletedIds.has(d.id)
          )
          if (additions.length === 0) return { customFieldDefs }
          const baseOrder = nextOrder(customFieldDefs)
          const stamped = additions.map((d, i) => ({
            ...d,
            order: baseOrder + i,
          }))
          return { customFieldDefs: [...customFieldDefs, ...stamped] }
        })
      },
      recoverContact: (id: string) => {
        set(({ contacts, deletedContacts, deletedCustomFieldDefs }) => {
          const recoverContact = deletedContacts.find((dC) => dC.id === id)
          if (!recoverContact) {
            return { contacts, deletedContacts }
          }

          return {
            deletedContacts: deletedContacts.filter((dC) => dC.id !== id),
            contacts: [
              ...contacts,
              stripTombstonedCustomFields(
                { ...recoverContact, updatedAt: Date.now() },
                deletedCustomFieldDefs
              ),
            ],
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
              return {
                ...c,
                dismissedUntil,
                dismissedNotificationId,
                updatedAt: Date.now(),
              }
            }),
          }
        })
      },
      toggleFavoriteContact: (id: string) => {
        set(({ contacts }) => {
          return {
            contacts: contacts.map((c) => {
              if (c.id !== id) {
                return c
              }
              return {
                ...c,
                isFavorite: !c.isFavorite,
                updatedAt: Date.now(),
              }
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
              const updatedContact = { ...c, updatedAt: Date.now() }
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
        hasMigratedFromAsyncStorage() ? MmkvStorage : GuardedAsyncStorage
      ),
    }
  )
)

function nextOrder(defs: CustomFieldDefinition[]): number {
  if (defs.length === 0) return 0
  return Math.max(...defs.map((d) => d.order)) + 1
}

export default useContacts
