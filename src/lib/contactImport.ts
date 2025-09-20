import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system'
import { Alert } from 'react-native'
import { Contact } from '../types/contact'
import { Conversation } from '../types/conversation'
import i18n from './locales'

export type ContactImportData = {
  version: '1.0'
  type: 'witnesswork-contact'
  exportedAt: string
  contact: Contact
  conversations?: Conversation[]
}

export type ImportResult = {
  success: boolean
  error?: string
  data?: ContactImportData
}

export type ImportHandlerCallbacks = {
  addContact: (contact: Contact) => void
  updateContact: (contact: Partial<Contact>) => void
  addConversation: (conversation: Conversation) => void
  updateConversation: (conversation: Partial<Conversation>) => void
  recoverContact: (contactId: string) => void
  showToast: (title: string, message: string) => void
  navigate: (contactId: string) => void
}

export const validateContactImport = (data: unknown): ImportResult => {
  try {
    if (!data || typeof data !== 'object' || data === null) {
      return {
        success: false,
        error: i18n.t('invalidFile_description'),
      }
    }

    // Type guard to check if data has the expected structure
    const possibleImport = data as Record<string, unknown>

    if (
      possibleImport.type !== 'witnesswork-contact' ||
      !possibleImport.contact
    ) {
      return {
        success: false,
        error: i18n.t('invalidFile_description'),
      }
    }

    // Basic validation of contact structure
    const contact = possibleImport.contact as Record<string, unknown>
    if (!contact.id || !contact.name || !contact.createdAt) {
      return {
        success: false,
        error: i18n.t('invalidFile_description'),
      }
    }

    return {
      success: true,
      data: possibleImport as ContactImportData,
    }
  } catch (error) {
    return {
      success: false,
      error: i18n.t('invalidFile_description'),
    }
  }
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

    const fileUri = result.assets[0].uri
    const fileContent = await FileSystem.readAsStringAsync(fileUri)
    const jsonData = JSON.parse(fileContent)

    return validateContactImport(jsonData)
  } catch (error) {
    console.error('Error importing contact:', error)
    return {
      success: false,
      error: i18n.t('invalidFile_description'),
    }
  }
}

export const importContactFromUrl = async (
  url: string
): Promise<ImportResult> => {
  try {
    const fileContent = await FileSystem.readAsStringAsync(url)
    const jsonData = JSON.parse(fileContent)
    return validateContactImport(jsonData)
  } catch (error) {
    console.error('Error importing contact from URL:', error)
    return {
      success: false,
      error: i18n.t('invalidFile_description'),
    }
  }
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
    (c) => c.id === importData.contact.id
  )

  return {
    conflictExists: !!existingContact,
    existingContact,
    isDeleted: !!deletedContact,
    deletedContact,
  }
}

// Generate new IDs for imported data to avoid conflicts
export const generateNewIds = (
  importData: ContactImportData
): ContactImportData => {
  const newContactId = `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  const updatedContact: Contact = {
    ...importData.contact,
    id: newContactId,
    createdAt: new Date(), // Update to current time
  }

  const updatedConversations = importData.conversations?.map((conv) => ({
    ...conv,
    id: `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    contact: { id: newContactId },
  }))

  return {
    ...importData,
    contact: updatedContact,
    conversations: updatedConversations,
  }
}

// Consolidated import handler that processes the complete import flow
export const handleContactImport = async (
  importData: ContactImportData,
  existingContact: Contact | undefined,
  callbacks: ImportHandlerCallbacks,
  replaceExisting: boolean = false
): Promise<void> => {
  try {
    let finalData = importData

    // If a conflict exists and we're not replacing it, then gen new IDs
    if (existingContact && !replaceExisting) {
      finalData = generateNewIds(importData)
    }

    if (replaceExisting) {
      callbacks.updateContact({
        ...finalData.contact,
      })
      finalData.conversations?.forEach((c) => {
        callbacks.updateConversation(c)
      })
    } else {
      callbacks.addContact(finalData.contact)
      finalData.conversations?.forEach((c) => {
        callbacks.addConversation(c)
      })
    }

    // Show success feedback
    callbacks.showToast(i18n.t('success'), i18n.t('contactImported'))

    // Navigate to the imported contact's details page
    const contactId = replaceExisting
      ? existingContact?.id || finalData.contact.id
      : finalData.contact.id

    callbacks.navigate(contactId)
  } catch (error) {
    console.error('Error processing import:', error)
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
