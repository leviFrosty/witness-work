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

export type ImportResult = {
  success: boolean

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

  mergeIncomingCustomFieldDefs: (incoming: CustomFieldDefinition[]) => void

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

export const validateContactImport = (data: unknown): ImportResult => {
  const parsed = parseContactShareData(data)
  return parsed ? { success: true, data: parsed } : invalidFile()
}

export const parseContactImportFile = (contents: string): ImportResult => {
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

export const importContactFromUrl = (url: string): Promise<ImportResult> =>
  readContactImportFile(url)

export const importContactFromLink = (url: string): ImportResult => {
  const decoded = parseContactShareLink(url)
  if (decoded === null) return invalidLink()
  const result = validateContactImport(decoded)
  return result.success ? result : invalidLink()
}

export const isContactFileUrl = (url: string): boolean =>
  url.startsWith('content:') ||
  (url.startsWith('file:') && /\.witnesswork(\?|#|$)/i.test(url))

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

export const importedVisitId = (contactId: string, sourceId: string) => {
  const hex = bytesToHex(
    sha256(
      utf8ToBytes(
        `witnesswork-contact-import\u0000${contactId}\u0000${sourceId}`
      )
    )
  )

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

const planImportedVisits = (
  incoming: Visit[],
  contactId: string,
  stored: Visit[],
  replacing: boolean,
  receivedAt: number
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
            ...(own.id === sourceId
              ? {}
              : { receivedAt: own.receivedAt ?? receivedAt }),
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
      visit: { ...fields, id, contact: { id: contactId }, receivedAt } as Visit,
    }
  })
}

export const handleContactImport = async (
  importData: ContactImportData,
  existingContact: Contact | undefined,
  callbacks: ImportHandlerCallbacks,
  replaceExisting: boolean = false
): Promise<void> => {
  try {
    const contactId = replaceExisting
      ? (existingContact?.id ?? importData.contact.id)
      : existingContact
        ? `contact_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
        : importData.contact.id

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
      replaceExisting,
      Date.now()
    )

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

    callbacks.showToast(i18n.t('success'), i18n.t('contactImported'))

    callbacks.navigate(contactId)
  } catch (error) {
    logger.error('Error processing import:', error)
    Alert.alert(i18n.t('error'), i18n.t('importError_description'))
  }
}

export const processCompleteImport = async (
  importData: ContactImportData,
  existingContacts: Contact[],
  deletedContacts: Contact[],
  callbacks: ImportHandlerCallbacks
): Promise<void> => {
  const { conflictExists, existingContact, isDeleted, deletedContact } =
    processContactImport(importData, existingContacts, deletedContacts)

  if (isDeleted && deletedContact) {
    callbacks.recoverContact(deletedContact.id)

    Alert.alert(
      i18n.t('contactRecovered'),
      i18n.t('contactRecovered_description'),
      [
        {
          text: i18n.t('keep'),
          style: 'cancel',
          onPress: () => {
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
