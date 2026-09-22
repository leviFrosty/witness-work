import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import { deleteAvatarFiles } from '@/lib/contactAvatarFiles'
import { stripContactForTombstone } from '@/lib/dataProtection'
import type { Contact } from '@/types/contact'

/**
 * Deleting householder records, with the data-protection policy applied.
 *
 * Lives beside the stores rather than inside `contactsStore` because deciding
 * _how thorough_ a delete is needs the preferences store, and because a contact
 * delete has to reach the Visit store and the filesystem — neither of which
 * belongs in a single store's reducer. Every user-initiated contact deletion
 * should route through here; `contactsStore.deleteContact` on its own is the
 * plain archive-and-keep primitive.
 */

/**
 * Deletes one contact on the user's behalf.
 *
 * With data protection mode off this is the historical behaviour: the contact
 * moves to the Recover Contacts list intact and its visits stay put.
 *
 * With the mode on it is a hard delete — the tombstone keeps only the id and
 * timestamp iCloud's last-writer-wins merge needs, the contact's visits go too
 * (each leaving the id + deletedAt tombstone the Visit store already writes),
 * and the avatar image is evicted from disk. An indefinitely-retained record
 * naming someone who never agreed to it is exactly what the mode exists to
 * prevent — see `docs/gdpr-mode-research.md` §9.4.
 */
export const deleteHouseholderContact = (contactId: string) => {
  const redact = usePreferences.getState().dataProtectionMode === true
  if (redact) {
    const { conversations, deleteConversation } = useConversations.getState()
    for (const visit of conversations) {
      if (visit.contact.id === contactId) deleteConversation(visit.id)
    }
    void deleteAvatarFiles(contactId)
  }
  useContacts.getState().deleteContact(contactId, { redact })
}

export type DeleteAllHouseholderDataResult = {
  /** Contacts removed from the active list. */
  contacts: number
  /** Visits removed from the active list. */
  visits: number
}

/**
 * Erases every householder record this device holds: all contacts, all visits,
 * every contact avatar on disk, and the content of any tombstone left behind by
 * an earlier soft delete.
 *
 * This is the "erase all householder data" affordance from
 * `docs/gdpr-mode-research.md` §9.6 — the counterpart to per-contact deletion,
 * and the action a publisher can point to when asked what becomes of what they
 * wrote down. The user's own data (time entries, goals, plans, profile) is
 * untouched; only records _about other people_ are in scope. It erases
 * unconditionally: the user asked, so the current mode is irrelevant.
 *
 * What survives is deliberately minimal: one redacted tombstone per record,
 * carrying an id and a timestamp so iCloud's last-writer-wins merge propagates
 * the erasure to the user's other devices instead of a stale peer pushing the
 * records back. See `stripContactForTombstone`.
 *
 * Not reversible. Callers must confirm destructively before invoking it.
 */
export const deleteAllHouseholderData = (): DeleteAllHouseholderDataResult => {
  usePreferences.getState().clearPrefillAddress()
  const { deleteConversation } = useConversations.getState()
  const visits = useConversations.getState().conversations
  const { contacts, deletedContacts } = useContacts.getState()
  const now = Date.now()

  // Routed through the store action so each visit's scheduled follow-up
  // notification is cancelled and its (already minimal) tombstone is written.
  for (const visit of visits) {
    deleteConversation(visit.id)
  }

  // Existing soft-delete tombstones still hold full householder records, so
  // they are redacted in place rather than left as they are.
  const tombstones = new Map<string, Contact>()
  for (const record of [...deletedContacts, ...contacts]) {
    tombstones.set(record.id, stripContactForTombstone(record, now))
    void deleteAvatarFiles(record.id)
  }

  useContacts.setState({
    contacts: [],
    deletedContacts: Array.from(tombstones.values()),
  })

  return { contacts: contacts.length, visits: visits.length }
}
