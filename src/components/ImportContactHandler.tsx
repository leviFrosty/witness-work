import { useCallback, useEffect, useMemo } from 'react'
import { Alert } from 'react-native'
import * as Linking from 'expo-linking'
import { useNavigation } from '@react-navigation/native'
import useContacts from '../stores/contactsStore'
import useConversations from '../stores/conversationStore'
import { Contact } from '../types/contact'
import { RootStackNavigation } from '../types/rootStack'
import {
  importContactFromUrl,
  processCompleteImport,
  ImportHandlerCallbacks,
} from '../lib/contactImport'
import i18n from '../lib/locales'
import { useToastController } from '@tamagui/toast'

interface ImportContactHandlerProps {
  onImportComplete?: () => void
}

const ImportContactHandler = ({
  onImportComplete,
}: ImportContactHandlerProps) => {
  const {
    contacts,
    deletedContacts,
    addContact,
    updateContact,
    recoverContact,
  } = useContacts()
  const { addConversation, updateConversation } = useConversations()
  const toast = useToastController()
  const navigation = useNavigation<RootStackNavigation>()
  const callbacks: ImportHandlerCallbacks = useMemo(
    () => ({
      addContact,
      updateContact,
      addConversation,
      updateConversation,
      recoverContact,
      showToast: (title: string, message: string) => {
        toast.show(title, { message, native: true })
      },
      navigate: (contactId: string) => {
        navigation.navigate('Contact Details', { id: contactId })
        onImportComplete?.()
      },
    }),
    [
      addContact,
      updateContact,
      addConversation,
      updateConversation,
      recoverContact,
      toast,
      navigation,
      onImportComplete,
    ]
  )

  const processFileImport = useCallback(
    async (url: string, currentContacts: Contact[]) => {
      const result = await importContactFromUrl(url)

      if (!result.success || !result.data) {
        Alert.alert(
          i18n.t('invalidFile'),
          result.error || i18n.t('invalidFile_description')
        )
        return
      }

      await processCompleteImport(
        result.data,
        currentContacts,
        deletedContacts,
        callbacks
      )
    },
    [callbacks, deletedContacts]
  )

  useEffect(() => {
    const handleUrl = (url: string) => {
      // Check if this is a JSON or witnesswork file being opened
      if (
        url.includes('.json') ||
        url.includes('application/json') ||
        url.includes('.witnesswork')
      ) {
        processFileImport(url, contacts)
      }
    }

    const linkingListener = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url)
    })

    // Check if app was opened with a file - only run once
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleUrl(url)
      }
    })

    return () => {
      linkingListener.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Intentionally empty to prevent re-running on state changes

  return null // This is a handler component, no UI
}

export default ImportContactHandler
