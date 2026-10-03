import { syncTimestamp } from '@/lib/syncClock'
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
import { PersistStorage } from '@/stores/mmkv'
import {
  isRedactedContactTombstone,
  stripContactForTombstone,
} from '@/lib/dataProtection'

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
      /**
       * Adds a contact unless an active contact, or one still waiting in
       * Recover Contacts, already has its id.
       *
       * A redacted tombstone (Delete permanently, an import Undo, data
       * protection, or details expired after 90 days) holds nothing to recover,
       * so it doesn't block the id. The contact replaces it, which keeps
       * deterministic imports re-runnable. The new record is stamped strictly
       * newer than the tombstone, because the iCloud merge keeps an active
       * contact only when it is newer than its deleted copy
       * (`reconcileActiveAndDeletedContacts`), and it carries `readdedAt` so a
       * stale copy of the tombstone can't redact it once it is archived again
       * (`mergeDeletedContacts`).
       */
      addContact: (contact: Contact) =>
        set(({ contacts, deletedContacts, deletedCustomFieldDefs }) => {
          const foundCurrentContact = contacts.find((c) => c.id === contact.id)
          const foundDeleteContact = deletedContacts.find(
            (delC) => delC.id === contact.id
          )

          if (
            foundCurrentContact ||
            (foundDeleteContact &&
              !isRedactedContactTombstone(foundDeleteContact))
          ) {
            return { contacts, deletedContacts }
          }

          const { readdedAt: _incoming, ...fields } = contact
          const updatedAt = syncTimestamp(foundDeleteContact?.updatedAt)
          const added = stripTombstonedCustomFields(
            {
              ...fields,
              updatedAt,
              // Only this store marks a re-add; an imported file's marker
              // describes another device's history.
              ...(foundDeleteContact ? { readdedAt: updatedAt } : {}),
            },
            deletedCustomFieldDefs
          )
          if (!foundDeleteContact) return { contacts: [...contacts, added] }
          return {
            contacts: [...contacts, added],
            deletedContacts: deletedContacts.filter(
              (delC) => delC.id !== contact.id
            ),
          }
        }),
      /**
       * Archives a contact.
       *
       * Normally the tombstone _is_ the archive — the whole record is kept so
       * Recover Contacts can restore it. Pass `redact` to make the delete
       * permanent instead: the tombstone is stripped to the id and timestamp
       * iCloud's last-writer-wins merge needs, and nothing about the
       * householder survives. Nothing is recoverable afterwards.
       *
       * The flag is an explicit argument rather than a preference read so this
       * store stays free of the preferences/expo dependency chain. Callers
       * deleting on the user's behalf should go through
       * `stores/householderData.deleteHouseholderContact`, which applies the
       * data-protection policy and takes the contact's visits and avatar with
       * it; a bare `deleteContact` is the archive-and-keep path.
       */
      deleteContact: (id: string, options?: { redact?: boolean }) => {
        const redact = options?.redact === true
        set(({ contacts, deletedContacts }) => {
          const foundContact = contacts.find((contact) => contact.id === id)
          if (!foundContact) {
            return { contacts, deletedContacts }
          }
          const now = syncTimestamp(foundContact.updatedAt)
          return {
            deletedContacts: [
              ...deletedContacts.filter((contact) => contact.id !== id),
              redact
                ? stripContactForTombstone(foundContact, now)
                : { ...foundContact, updatedAt: now },
            ],
            contacts: contacts.filter((contact) => contact.id !== id),
          }
        })
      },
      /**
       * Batch `deleteContact` for Select mode: one store update (and one
       * persist) for the whole selection instead of one per contact.
       */
      deleteContacts: (ids: string[], options?: { redact?: boolean }) => {
        const redact = options?.redact === true
        const targets = new Set(ids)
        set(({ contacts, deletedContacts }) => {
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
              ...deletedContacts.filter(
                (contact) => !removedIds.has(contact.id)
              ),
              ...removed.map((contact) =>
                redact
                  ? stripContactForTombstone(contact, now)
                  : { ...contact, updatedAt: now }
              ),
            ],
            contacts: contacts.filter((contact) => !removedIds.has(contact.id)),
          }
        })
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
          const now = syncTimestamp()
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
            d.id === id
              ? { ...d, label: trimmed, updatedAt: syncTimestamp(d.updatedAt) }
              : d
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
          const now = syncTimestamp(
            customFieldDefs.reduce(
              (stamp, def) => Math.max(stamp, def.updatedAt),
              0
            )
          )
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
            archived[i] = {
              ...d,
              order: orderedIds.length + i,
              updatedAt: d.order === orderedIds.length + i ? d.updatedAt : now,
            }
          })
          return {
            customFieldDefs: [...reorderedActive, ...archived],
          }
        })
      },
      archiveCustomFieldDef: (id: string) => {
        set(({ customFieldDefs }) => ({
          customFieldDefs: customFieldDefs.map((d) =>
            d.id === id
              ? { ...d, archived: true, updatedAt: syncTimestamp(d.updatedAt) }
              : d
          ),
        }))
      },
      restoreCustomFieldDef: (id: string) => {
        set(({ customFieldDefs }) => {
          const target = customFieldDefs.find((d) => d.id === id)
          if (!target || !target.archived) return { customFieldDefs }
          // Slot restored def at the end of the active list.
          const activeCount = customFieldDefs.filter((d) => !d.archived).length
          const now = syncTimestamp(target.updatedAt)
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

            const deletedAt = syncTimestamp(target.updatedAt)
            const tombstone: CustomFieldTombstone = {
              id,
              deletedAt,
              ...(target.legacyIds ? { legacyIds: target.legacyIds } : {}),
            }
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
          // A redacted tombstone has no content left to restore — recovering it
          // would resurrect an empty, nameless contact.
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
      /**
       * "Delete permanently" in Recover Contacts, and the second half of an
       * import Undo. Swaps the archived contact for a redacted tombstone
       * (`stripContactForTombstone`) instead of dropping it. Other devices may
       * still hold the contact, archived with every householder detail or
       * active in a stale file, and the iCloud merge brings it back unless a
       * newer deletion beats it. Nothing about the householder survives, and
       * Recover Contacts hides the tombstone.
       *
       * Photo files, every revision included, are the caller's to erase with
       * `deleteAvatarFiles`, which keeps this store free of expo dependencies.
       */
      removeDeletedContact: (id: string) => {
        set(({ deletedContacts }) => {
          const archived = deletedContacts.find((dC) => dC.id === id)
          if (!archived || isRedactedContactTombstone(archived)) {
            return { deletedContacts }
          }
          // Strictly newer than the archived copy, even when both are written
          // in the same millisecond (an import Undo archives, then redacts).
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
                updatedAt: syncTimestamp(c.updatedAt),
              }
            }),
          }
        })
      },
      /**
       * Batch `dismissContact` for Select mode: one store update (and one
       * persist) for the whole selection instead of one per contact.
       */
      dismissContacts: (
        updates: {
          id: string
          dismissedUntil: Date
          dismissedNotificationId?: string
        }[]
      ) => {
        const byId = new Map(updates.map((update) => [update.id, update]))
        set(({ contacts }) => ({
          contacts: contacts.map((c) => {
            const update = byId.get(c.id)
            if (!update) return c
            return {
              ...c,
              dismissedUntil: update.dismissedUntil,
              dismissedNotificationId: update.dismissedNotificationId,
              updatedAt: syncTimestamp(c.updatedAt),
            }
          }),
        }))
      },
      /** Batch `undismissContact` for Select mode, in one store update. */
      undismissContacts: (ids: string[]) => {
        const targets = new Set(ids)
        set(({ contacts }) => ({
          contacts: contacts.map((c) => {
            if (!targets.has(c.id)) return c
            const updatedContact = {
              ...c,
              updatedAt: syncTimestamp(c.updatedAt),
            }
            delete updatedContact.dismissedUntil
            delete updatedContact.dismissedNotificationId
            return updatedContact
          }),
        }))
      },
      /** Batch favorite for Select mode; leaves already-matching contacts alone. */
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
        set(({ contacts }) => {
          return {
            contacts: contacts.map((c) => {
              if (c.id !== id) {
                return c
              }
              const updatedContact = {
                ...c,
                updatedAt: syncTimestamp(c.updatedAt),
              }
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
      storage: createJSONStorage(() => PersistStorage),
    }
  )
)

function nextOrder(defs: CustomFieldDefinition[]): number {
  if (defs.length === 0) return 0
  return Math.max(...defs.map((d) => d.order)) + 1
}

export default useContacts
