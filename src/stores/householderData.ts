import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import { deleteAvatarFiles } from '@/lib/contactAvatarFiles'
import {
  deleteUnreferencedNoteImages,
  noteImageIdsOf,
} from '@/stores/noteImages'
import { stripContactForTombstone } from '@/lib/dataProtection'
import { syncTimestamp } from '@/lib/syncClock'
import { deleteTemporaryCopies } from '@/lib/temporaryCopies'
import type { Contact } from '@/types/contact'

const hardDeleteContacts = (contactIds: string[]) => {
  const targets = new Set(contactIds)
  const { conversations, deleteConversation } = useConversations.getState()
  const visits = conversations.filter((v) => targets.has(v.contact.id))
  for (const visit of visits) deleteConversation(visit.id)
  contactIds.forEach((id) => void deleteAvatarFiles(id))
  void deleteUnreferencedNoteImages(noteImageIdsOf(visits))

  void deleteTemporaryCopies()
  useContacts.getState().deleteContacts(contactIds, { redact: true })
}

export const deleteHouseholderContact = (contactId: string) =>
  deleteHouseholderContacts([contactId])

export const deleteHouseholderContacts = (contactIds: string[]) => {
  if (usePreferences.getState().dataProtectionMode === true) {
    hardDeleteContacts(contactIds)
    return
  }
  useContacts.getState().deleteContacts(contactIds)
}

export const permanentlyDeleteHouseholderContacts = (contactIds: string[]) =>
  hardDeleteContacts(contactIds)

export type DeleteAllHouseholderDataResult = {
  contacts: number

  visits: number
}

export const deleteAllHouseholderData = (): DeleteAllHouseholderDataResult => {
  usePreferences.getState().clearPrefillAddress()
  const { deleteConversation } = useConversations.getState()
  const visits = useConversations.getState().conversations
  const { contacts, deletedContacts } = useContacts.getState()

  for (const visit of visits) {
    deleteConversation(visit.id)
  }
  void deleteUnreferencedNoteImages(noteImageIdsOf(visits))

  const tombstones = new Map<string, Contact>()
  for (const record of [...deletedContacts, ...contacts]) {
    tombstones.set(
      record.id,
      stripContactForTombstone(record, syncTimestamp(record.updatedAt))
    )
    void deleteAvatarFiles(record.id)
  }
  void deleteTemporaryCopies()

  useContacts.setState({
    contacts: [],
    deletedContacts: Array.from(tombstones.values()),
  })

  return { contacts: contacts.length, visits: visits.length }
}
