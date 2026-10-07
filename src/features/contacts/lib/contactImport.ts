import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { Alert } from 'react-native'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'
import { CustomFieldDefinition } from '@/types/customField'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { isRedactedContactTombstone } from '@/lib/dataProtection'
import {
  CONTACT_SHARE_LIMITS,
  ContactImportData,
  deviceOnlyFollowUpFields,
  parseContactShareData,
  sharedContactFields,
  sharedCustomFieldDefs,
  sharedVisitFields,
} from '@/features/contacts/lib/contactShareFormat'
import {
  isContactShareLink,
  parseContactShareLink,
} from '@/features/contacts/lib/contactShareLink'

export type { ContactImportData }

/**
 * Every way a shared contact reaches the app ends in `validateContactImport`:
 *
 * - Share links (`https://ww-proxy.leviwilkerson.com/c#…`, the legacy `/c/…` and
 *   `witnesswork://import-contact/…`) through `importContactFromLink`.
 * - `.witnesswork` files opened from Files, Messages, AirDrop or another app
 *   through `importContactFromUrl`.
 * - Settings → More → Import Contact through `importContactFromFile`.
 *
 * The first two arrive as URLs; `importContactFromIncomingUrl` routes them.
 * Nothing is written until the user confirms, and `handleContactImport` applies
 * the share format's field allow-list again on write.
 */

export type ImportResult = {
  success: boolean
  /** Alert title for a failure. Callers fall back to `invalidFile`. */
  errorTitle?: string
  error?: string
  data?: ContactImportData
}

export type ImportHandlerCallbacks = {
  addContact: (contact: Contact) => void
  updateContact: (contact: Partial<Contact>) => void
  addConversation: (conversation: Visit) => void
  updateConversation: (conversation: Partial<Visit>) => void
  recoverContact: (contactId: string) => void
  /**
   * Adds any defs from `incoming` whose id isn't already known locally. Local
   * defs always win on label conflicts — this only fills in missing referenced
   * fields so the imported contact's customFields render with their original
   * labels.
   */
  mergeIncomingCustomFieldDefs: (incoming: CustomFieldDefinition[]) => void
  /** Visits stored now, read at write time so a Replace sees current data. */
  getConversations: () => Visit[]
  showToast: (title: string, message: string) => void
  navigate: (contactId: string) => void
}

const invalidFile = (): ImportResult => ({
  success: false,
  error: i18n.t('invalidFile_description'),
})

const invalidLink = (): ImportResult => ({
  success: false,
  errorTitle: i18n.t('invalidContactLink'),
  error: i18n.t('invalidContactLink_description'),
})

/**
 * Validates decoded share data. Anything malformed or over
 * `CONTACT_SHARE_LIMITS` fails as a whole; fields outside the share format are
 * dropped.
 */
export const validateContactImport = (data: unknown): ImportResult => {
  const parsed = parseContactShareData(data)
  return parsed ? { success: true, data: parsed } : invalidFile()
}

/** Validates the text of a `.witnesswork` file. */
export const parseContactImportFile = (contents: string): ImportResult => {
  // Each UTF-16 code unit is at least one byte of the file.
  if (contents.length > CONTACT_SHARE_LIMITS.MAX_FILE_BYTES)
    return invalidFile()
  let json: unknown
  try {
    json = JSON.parse(contents)
  } catch {
    return invalidFile()
  }
  return validateContactImport(json)
}

const readContactImportFile = async (uri: string): Promise<ImportResult> => {
  let contents: string
  try {
    // One byte past the limit is enough to refuse a larger file without
    // reading the rest of it.
    contents = await FileSystem.readAsStringAsync(uri, {
      position: 0,
      length: CONTACT_SHARE_LIMITS.MAX_FILE_BYTES + 1,
    })
  } catch (error) {
    logger.warn('[contactImport] could not read file:', String(error))
    return invalidFile()
  }
  return parseContactImportFile(contents)
}

/** Settings → More → Import Contact: the user picks a `.witnesswork` file. */
export const importContactFromFile = async (): Promise<ImportResult> => {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['*/*'],
      copyToCacheDirectory: true,
    })

    if (result.canceled) {
      return {
        success: false,
        error: 'Cancelled',
      }
    }

    return await readContactImportFile(result.assets[0].uri)
  } catch (error) {
    logger.error('Error importing contact:', error)
    return invalidFile()
  }
}

/** A `.witnesswork` file another app handed to WitnessWork. */
export const importContactFromUrl = (url: string): Promise<ImportResult> =>
  readContactImportFile(url)

/** A contact share link, in any of its forms. */
export const importContactFromLink = (url: string): ImportResult => {
  const decoded = parseContactShareLink(url)
  if (decoded === null) return invalidLink()
  const result = validateContactImport(decoded)
  return result.success ? result : invalidLink()
}

/** Whether `url` is a `.witnesswork` file opened in WitnessWork. */
export const isContactFileUrl = (url: string): boolean =>
  // Android document providers may use opaque content URIs without a
  // filename. The intent filter restricts MIME type; import validates data
  // before prompting and never writes it without confirmation.
  url.startsWith('content:') ||
  (url.startsWith('file:') && /\.witnesswork(\?|#|$)/i.test(url))

/**
 * Imports a contact share that arrived as a URL (a link or an opened file), or
 * returns `null` when `url` is neither.
 */
export const importContactFromIncomingUrl = async (
  url: string
): Promise<ImportResult | null> => {
  if (isContactShareLink(url)) return importContactFromLink(url)
  if (isContactFileUrl(url)) return importContactFromUrl(url)
  return null
}

export const processContactImport = (
  importData: ContactImportData,
  existingContacts: Contact[],
  deletedContacts: Contact[]
): {
  conflictExists: boolean
  existingContact?: Contact
  isDeleted: boolean
  deletedContact?: Contact
} => {
  const existingContact = existingContacts.find(
    (c) => c.id === importData.contact.id
  )
  // A redacted tombstone (a permanent delete) has nothing to recover, so the
  // contact is imported afresh instead; `addContact` replaces the tombstone.
  const deletedContact = deletedContacts.find(
    (c) => c.id === importData.contact.id && !isRedactedContactTombstone(c)
  )

  return {
    conflictExists: !!existingContact,
    existingContact,
    isDeleted: !!deletedContact,
    deletedContact,
  }
}

/**
 * The local id for a visit imported into `contactId`. It's derived from the
 * sender's visit id, so importing the same share again finds the copy made last
 * time instead of duplicating it. It's also keyed to `contactId` through a hash
 * nobody can steer, so it can't match another contact's visit.
 */
export const importedVisitId = (contactId: string, sourceId: string) => {
  const hex = bytesToHex(
    sha256(
      utf8ToBytes(
        `witnesswork-contact-import\u0000${contactId}\u0000${sourceId}`
      )
    )
  )
  // UUID layout (version 8, RFC 9562), like the app's other ids.
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-')
}

type ImportedVisitWrite = { visit: Visit; update: boolean }

/**
 * Turns a share's visits into writes for `contactId`. Every visit is attached
 * to `contactId`, and a new visit never takes the sender's id.
 *
 * A Replace updates a stored visit only when it already belongs to `contactId`:
 * the copy an earlier import of the same share made, or the visit itself when
 * it was shared from this device (or by an older import that kept the sender's
 * ids). The update keeps the fields that never travel, such as the visit's
 * calendar choice and buddies. Every other visit is added under a fresh id.
 */
const planImportedVisits = (
  incoming: Visit[],
  contactId: string,
  stored: Visit[],
  replacing: boolean
): ImportedVisitWrite[] => {
  const byId = new Map(stored.map((visit) => [visit.id, visit]))
  const used = new Set<string>()
  return incoming.map((source) => {
    const sourceId = String(source.id)
    const {
      id: _sourceId,
      contact: _sourceContact,
      ...fields
    } = sharedVisitFields(source)
    if (replacing) {
      const own = [importedVisitId(contactId, sourceId), sourceId]
        .map((id) => byId.get(id))
        .find((visit) => visit?.contact.id === contactId && !used.has(visit.id))
      if (own) {
        used.add(own.id)
        const followUp = fields.followUp && {
          ...deviceOnlyFollowUpFields(own.followUp),
          ...fields.followUp,
        }
        return {
          update: true,
          visit: {
            ...fields,
            ...(followUp ? { followUp } : {}),
            id: own.id,
            contact: { id: contactId },
          } as Visit,
        }
      }
    }
    let id = importedVisitId(contactId, sourceId)
    for (let n = 1; byId.has(id) || used.has(id); n++) {
      id = importedVisitId(contactId, `${sourceId}#${n}`)
    }
    used.add(id)
    return {
      update: false,
      visit: { ...fields, id, contact: { id: contactId } } as Visit,
    }
  })
}

// Consolidated import handler that processes the complete import flow
export const handleContactImport = async (
  importData: ContactImportData,
  existingContact: Contact | undefined,
  callbacks: ImportHandlerCallbacks,
  replaceExisting: boolean = false
): Promise<void> => {
  try {
    // Replace writes over the existing contact. Importing beside an existing
    // contact gets a new id; otherwise the sender's id is kept so a later
    // share of the same contact offers Replace.
    const contactId = replaceExisting
      ? (existingContact?.id ?? importData.contact.id)
      : existingContact
        ? `contact_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
        : importData.contact.id
    // Only fields the share format carries are written, whatever the caller
    // passes, so consent, favorites and other device-local state are never
    // taken from a sender, and a Replace keeps this device's own.
    const contact = {
      ...sharedContactFields(importData.contact),
      id: contactId,
    } as Contact
    const defs = sharedCustomFieldDefs(
      contact,
      importData.customFieldDefs ?? []
    )
    const visits = planImportedVisits(
      importData.conversations ?? [],
      contactId,
      callbacks.getConversations(),
      replaceExisting
    )

    // Merge custom field defs first so the contact's customFields keys have
    // their definitions in place by the time the contact lands in the store.
    // Order matters here only for visual consistency on the details screen —
    // both stores are local Zustand and writes are synchronous.
    if (defs.length > 0) {
      callbacks.mergeIncomingCustomFieldDefs(defs)
    }

    if (replaceExisting) {
      callbacks.updateContact(contact)
    } else {
      callbacks.addContact(
        existingContact ? { ...contact, createdAt: new Date() } : contact
      )
    }
    visits.forEach(({ visit, update }) => {
      if (update) callbacks.updateConversation(visit)
      else callbacks.addConversation(visit)
    })

    // Show success feedback
    callbacks.showToast(i18n.t('success'), i18n.t('contactImported'))

    // Navigate to the imported contact's details page
    callbacks.navigate(contactId)
  } catch (error) {
    logger.error('Error processing import:', error)
    Alert.alert(i18n.t('error'), i18n.t('importError_description'))
  }
}

// Complete import process with conflict resolution
export const processCompleteImport = async (
  importData: ContactImportData,
  existingContacts: Contact[],
  deletedContacts: Contact[],
  callbacks: ImportHandlerCallbacks
): Promise<void> => {
  const { conflictExists, existingContact, isDeleted, deletedContact } =
    processContactImport(importData, existingContacts, deletedContacts)

  // Handle deleted contact case - automatically recover and then ask for override
  if (isDeleted && deletedContact) {
    callbacks.recoverContact(deletedContact.id)

    // Show dialog asking if user wants to override the recovered contact
    Alert.alert(
      i18n.t('contactRecovered'),
      i18n.t('contactRecovered_description'),
      [
        {
          text: i18n.t('keep'),
          style: 'cancel',
          onPress: () => {
            // Just navigate to the recovered contact
            callbacks.showToast(i18n.t('success'), i18n.t('contactRecovered'))
            callbacks.navigate(deletedContact.id)
          },
        },
        {
          text: i18n.t('replace'),
          onPress: () =>
            handleContactImport(importData, deletedContact, callbacks, true),
        },
      ]
    )
  } else if (conflictExists && existingContact) {
    Alert.alert(i18n.t('contactExists'), i18n.t('contactExists_description'), [
      {
        text: i18n.t('keep'),
        style: 'cancel',
      },
      {
        text: i18n.t('replace'),
        onPress: () =>
          handleContactImport(importData, existingContact, callbacks, true),
      },
    ])
  } else {
    await handleContactImport(importData, existingContact, callbacks, false)
  }
}
