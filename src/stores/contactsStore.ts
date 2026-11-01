import { syncTimestamp } from '@/lib/syncClock'
import { create } from 'zustand'
import { combine, createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
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
  addCustomFieldDefinition,
  archiveCustomFieldDefinition,
  nextCustomFieldOrder,
  purgeCustomFieldDefinition,
  renameCustomFieldDefinition,
  reorderCustomFieldDefinitions,
  restoreCustomFieldDefinition,
} from '@/lib/customFieldDefinitions'
import { PersistStorage } from '@/stores/mmkv'
import {
  isRedactedContactTombstone,
  stripContactForTombstone,
} from '@/lib/dataProtection'

const initialState = {
  contacts: [] as Contact[],
  deletedContacts: [] as Contact[],

  customFieldDefs: [] as CustomFieldDefinition[],
  deletedCustomFieldDefs: [] as CustomFieldTombstone[],
}

function withContactsDeleted(
  {
    contacts,
    deletedContacts,
  }: Pick<typeof initialState, 'contacts' | 'deletedContacts'>,
  ids: string[],
  options?: { redact?: boolean }
) {
  const targets = new Set(ids)
  const removed = contacts.filter((contact) => targets.has(contact.id))
  if (!removed.length) return { contacts, deletedContacts }
  const removedIds = new Set(removed.map((contact) => contact.id))
  const now = syncTimestamp(
    removed.reduce(
      (stamp, contact) => Math.max(stamp, contact.updatedAt ?? 0),
      0
    )
  )
  return {
    deletedContacts: [
      ...deletedContacts.filter((contact) => !removedIds.has(contact.id)),
      ...removed.map((contact) =>
        options?.redact === true
          ? stripContactForTombstone(contact, now)
          : { ...contact, updatedAt: now }
      ),
    ],
    contacts: contacts.filter((contact) => !removedIds.has(contact.id)),
  }
}

function withContactsDismissed(
  contacts: Contact[],
  updates: {
    id: string
    dismissedUntil: Date
    dismissedNotificationId?: string
  }[]
) {
  const byId = new Map(updates.map((update) => [update.id, update]))
  return contacts.map((c) => {
    const update = byId.get(c.id)
    if (!update) return c
    return {
      ...c,
      dismissedUntil: update.dismissedUntil,
      dismissedNotificationId: update.dismissedNotificationId,
      updatedAt: syncTimestamp(c.updatedAt),
    }
  })
}

function withContactsUndismissed(contacts: Contact[], ids: string[]) {
  const targets = new Set(ids)
  return contacts.map((c) => {
    if (!targets.has(c.id)) return c
    const updatedContact = { ...c, updatedAt: syncTimestamp(c.updatedAt) }
    delete updatedContact.dismissedUntil
    delete updatedContact.dismissedNotificationId
    return updatedContact
  })
}

const withAddedContacts = (
  {
    contacts,
    deletedContacts,
    deletedCustomFieldDefs,
  }: Pick<
    typeof initialState,
    'contacts' | 'deletedContacts' | 'deletedCustomFieldDefs'
  >,
  incoming: Contact[]
): Partial<typeof initialState> => {
  const takenIds = new Set(contacts.map((c) => c.id))
  const deletedById = new Map<string, Contact>()
  for (const c of deletedContacts) {
    if (!deletedById.has(c.id)) deletedById.set(c.id, c)
  }
  const added: Contact[] = []
  const replacedTombstoneIds = new Set<string>()
  for (const contact of incoming) {
    if (takenIds.has(contact.id)) continue
    const foundDeleteContact = deletedById.get(contact.id)
    if (foundDeleteContact && !isRedactedContactTombstone(foundDeleteContact)) {
      continue
    }

    const { readdedAt: _incoming, ...fields } = contact
    const updatedAt = syncTimestamp(foundDeleteContact?.updatedAt)
    added.push(
      stripTombstonedCustomFields(
        {
          ...fields,
          updatedAt,

          ...(foundDeleteContact ? { readdedAt: updatedAt } : {}),
        },
        deletedCustomFieldDefs
      )
    )
    takenIds.add(contact.id)
    if (foundDeleteContact) replacedTombstoneIds.add(contact.id)
  }
  if (!added.length) return {}
  if (!replacedTombstoneIds.size) return { contacts: [...contacts, ...added] }
  return {
    contacts: [...contacts, ...added],
    deletedContacts: deletedContacts.filter(
      (delC) => !replacedTombstoneIds.has(delC.id)
    ),
  }
}

export const useContacts = create(
  persist(
    combine(initialState, (set) => ({
      set,

      addContact: (contact: Contact) =>
        set((state) => withAddedContacts(state, [contact])),

      addContacts: (contacts: Contact[]) =>
        set((state) => withAddedContacts(state, contacts)),

      deleteContact: (id: string, options?: { redact?: boolean }) => {
        set((state) => withContactsDeleted(state, [id], options))
      },

      deleteContacts: (ids: string[], options?: { redact?: boolean }) => {
        set((state) => withContactsDeleted(state, ids, options))
      },
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
                updatedAt: syncTimestamp(c.updatedAt),
              }
            }),
          }
        })
      },

      addCustomFieldDef: (label: string): CustomFieldDefinition | null => {
        let result: CustomFieldDefinition | null = null
        set(({ customFieldDefs }) => {
          const { defs, def } = addCustomFieldDefinition(customFieldDefs, label)
          result = def
          return { customFieldDefs: defs }
        })
        return result
      },
      renameCustomFieldDef: (id: string, label: string) => {
        set(({ customFieldDefs }) => ({
          customFieldDefs: renameCustomFieldDefinition(
            customFieldDefs,
            id,
            label
          ),
        }))
      },

      reorderCustomFieldDefs: (orderedIds: string[]) => {
        set(({ customFieldDefs }) => ({
          customFieldDefs: reorderCustomFieldDefinitions(
            customFieldDefs,
            orderedIds
          ),
        }))
      },
      archiveCustomFieldDef: (id: string) => {
        set(({ customFieldDefs }) => ({
          customFieldDefs: archiveCustomFieldDefinition(customFieldDefs, id),
        }))
      },
      restoreCustomFieldDef: (id: string) => {
        set(({ customFieldDefs }) => ({
          customFieldDefs: restoreCustomFieldDefinition(customFieldDefs, id),
        }))
      },

      purgeCustomFieldDef: (id: string) => {
        set(
          ({
            contacts,
            deletedContacts,
            customFieldDefs,
            deletedCustomFieldDefs,
          }) => {
            const purged = purgeCustomFieldDefinition(
              customFieldDefs,
              deletedCustomFieldDefs,
              id
            )
            if (!purged) return { customFieldDefs, deletedCustomFieldDefs }
            const { tombstone } = purged
            return {
              customFieldDefs: purged.defs,
              deletedCustomFieldDefs: purged.tombstones,
              contacts: contacts.map((c) =>
                stripTombstonedCustomFields(c, [tombstone], tombstone.deletedAt)
              ),
              deletedContacts: deletedContacts.map((c) =>
                stripTombstonedCustomFields(c, [tombstone], tombstone.deletedAt)
              ),
            }
          }
        )
      },

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
            const updatedAt = syncTimestamp()
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
          const baseOrder = nextCustomFieldOrder(customFieldDefs)
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

          if (!recoverContact || recoverContact.redacted) {
            return { contacts, deletedContacts }
          }

          return {
            deletedContacts: deletedContacts.filter((dC) => dC.id !== id),
            contacts: [
              ...contacts,
              stripTombstonedCustomFields(
                {
                  ...recoverContact,
                  updatedAt: syncTimestamp(recoverContact.updatedAt),
                },
                deletedCustomFieldDefs
              ),
            ],
          }
        })
      },

      removeDeletedContact: (id: string) => {
        set(({ deletedContacts }) => {
          const archived = deletedContacts.find((dC) => dC.id === id)
          if (!archived || isRedactedContactTombstone(archived)) {
            return { deletedContacts }
          }

          const deletedAt = syncTimestamp(archived.updatedAt)
          return {
            deletedContacts: deletedContacts.map((dC) =>
              dC.id === id ? stripContactForTombstone(dC, deletedAt) : dC
            ),
          }
        })
      },
      dismissContact: (
        id: string,
        dismissedUntil: Date,
        dismissedNotificationId?: string
      ) => {
        set(({ contacts }) => ({
          contacts: withContactsDismissed(contacts, [
            { id, dismissedUntil, dismissedNotificationId },
          ]),
        }))
      },

      dismissContacts: (
        updates: {
          id: string
          dismissedUntil: Date
          dismissedNotificationId?: string
        }[]
      ) => {
        set(({ contacts }) => ({
          contacts: withContactsDismissed(contacts, updates),
        }))
      },

      undismissContacts: (ids: string[]) => {
        set(({ contacts }) => ({
          contacts: withContactsUndismissed(contacts, ids),
        }))
      },

      setContactsFavorite: (ids: string[], isFavorite: boolean) => {
        const targets = new Set(ids)
        set(({ contacts }) => ({
          contacts: contacts.map((c) =>
            targets.has(c.id) && !!c.isFavorite !== isFavorite
              ? { ...c, isFavorite, updatedAt: syncTimestamp(c.updatedAt) }
              : c
          ),
        }))
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
                updatedAt: syncTimestamp(c.updatedAt),
              }
            }),
          }
        })
      },
      undismissContact: (id: string) => {
        set(({ contacts }) => ({
          contacts: withContactsUndismissed(contacts, [id]),
        }))
      },
      _WARNING_forceDeleteContacts: () => set({ contacts: [] }),
      _WARNING_clearDeleted: () => set({ deletedContacts: [] }),
    })),
    {
      name: 'contacts',
      migrate: keepPersistedState,
      storage: createJSONStorage(() => PersistStorage),
    }
  )
)

export default useContacts
