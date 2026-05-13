import { useEffect } from 'react'
import { Alert } from 'react-native'
import * as Linking from 'expo-linking'
import { useToastController } from '@tamagui/toast'
import {
  ImportHandlerCallbacks,
  importContactFromUrl,
  processCompleteImport,
  validateContactImport,
} from '../../../lib/contactImport'
import {
  isContactShareLink,
  parseContactShareLink,
} from '../../../lib/contactShareLink'
import useContacts from '../../../stores/contactsStore'
import useConversations from '../../../stores/conversationStore'
import { navigationRef } from '../../../lib/linking'
import i18n from '../../../lib/locales'
import { logger } from '../../../lib/logger'

/**
 * Handles two kinds of incoming contact URLs:
 *
 * 1. `https://ww-proxy.leviwilkerson.com/c/<payload>` — Universal Link from a
 *    shared contact (decoded via `parseContactShareLink`).
 * 2. `file://…/<name>.witnesswork` — file attachment tapped from Files / iMessage
 *    / AirDrop (registered via `CFBundleDocumentTypes`).
 *
 * Both paths validate, show a confirm dialog, run the existing import flow, and
 * navigate to the imported contact.
 */
export default function ContactImportListener() {
  const {
    contacts,
    deletedContacts,
    addContact,
    updateContact,
    recoverContact,
    mergeIncomingCustomFieldDefs,
  } = useContacts()
  const { addConversation, updateConversation } = useConversations()
  const toast = useToastController()

  useEffect(() => {
    const isContactFileUrl = (url: string) =>
      /\.witnesswork(\?|#|$)/i.test(url) &&
      (url.startsWith('file:') || url.startsWith('content:'))

    const handle = async (url: string | null) => {
      logger.log('[ContactImportListener] handle() url =', url)
      if (!url) {
        logger.log('[ContactImportListener] null url — ignoring')
        return
      }

      const isShareLink = isContactShareLink(url)
      const isFileUrl = isContactFileUrl(url)
      logger.log('[ContactImportListener] classification:', {
        isShareLink,
        isFileUrl,
      })

      let importData: Awaited<ReturnType<typeof importContactFromUrl>>['data'] =
        undefined

      if (isShareLink) {
        // Universal link (https://ww-proxy.leviwilkerson.com/c/<payload>).
        logger.log('[ContactImportListener] decoding universal link')
        const decoded = parseContactShareLink(url)
        logger.log('[ContactImportListener] decoded =', decoded)
        if (decoded === null) {
          logger.error(
            '[ContactImportListener] parseContactShareLink returned null'
          )
          Alert.alert(i18n.t('invalidFile'), i18n.t('invalidFile_description'))
          return
        }
        const validation = validateContactImport(decoded)
        logger.log('[ContactImportListener] validation =', validation)
        if (!validation.success || !validation.data) {
          Alert.alert(
            i18n.t('invalidFile'),
            validation.error || i18n.t('invalidFile_description')
          )
          return
        }
        importData = validation.data
      } else if (isFileUrl) {
        // File attachment tapped from Files / iMessage / AirDrop.
        const result = await importContactFromUrl(url)
        if (!result.success || !result.data) {
          Alert.alert(
            i18n.t('invalidFile'),
            result.error || i18n.t('invalidFile_description')
          )
          return
        }
        importData = result.data
      } else {
        logger.log('[ContactImportListener] url did not match any handler')
        return
      }

      if (!importData) return
      const finalImportData = importData
      Alert.alert(
        i18n.t('importContactConfirm_title'),
        i18n.t('importContactConfirm_description', {
          name: finalImportData.contact.name,
        }),
        [
          { text: i18n.t('cancel'), style: 'cancel' },
          {
            text: i18n.t('import'),
            onPress: async () => {
              try {
                const callbacks: ImportHandlerCallbacks = {
                  addContact,
                  updateContact,
                  addConversation,
                  updateConversation,
                  recoverContact,
                  mergeIncomingCustomFieldDefs,
                  showToast: (title, message) =>
                    toast.show(title, { message, native: true }),
                  navigate: (contactId) => {
                    if (navigationRef.isReady()) {
                      navigationRef.navigate('Contact Details', {
                        id: contactId,
                      })
                    }
                  },
                }
                await processCompleteImport(
                  finalImportData,
                  contacts,
                  deletedContacts,
                  callbacks
                )
              } catch (error) {
                logger.error('Error importing contact from file URL:', error)
                Alert.alert(i18n.t('error'), i18n.t('importError_description'))
              }
            },
          },
        ]
      )
    }

    Linking.getInitialURL()
      .then((initial) => {
        logger.log('[ContactImportListener] getInitialURL resolved =', initial)
        return handle(initial)
      })
      .catch((error) => {
        logger.error('[ContactImportListener] getInitialURL error:', error)
      })
    const sub = Linking.addEventListener('url', ({ url }) => {
      logger.log('[ContactImportListener] url event fired, url =', url)
      handle(url)
    })
    return () => sub.remove()
  }, [
    contacts,
    deletedContacts,
    addContact,
    updateContact,
    recoverContact,
    mergeIncomingCustomFieldDefs,
    addConversation,
    updateConversation,
    toast,
  ])

  return null
}
