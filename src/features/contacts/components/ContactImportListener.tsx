import { useEffect, useRef, useState } from 'react'
import { Alert } from 'react-native'
import * as Linking from 'expo-linking'
import { launchURL } from '@/lib/launchLinks'
import { toast } from '@/stores/toasts'
import {
  ImportHandlerCallbacks,
  importContactFromIncomingUrl,
  processCompleteImport,
} from '@/features/contacts/lib/contactImport'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { navigationRef } from '@/features/contacts/lib/linking'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { redactLink } from '@/lib/redactLink'
import { useIsTakingOver, useTakeoverHold } from '@/hooks/useTakeoverTurn'
import { usePreferences } from '@/stores/preferences'

export default function ContactImportListener() {
  const handledInitialUrl = useRef(false)

  const [pendingUrls, setPendingUrls] = useState<string[]>([])
  const onboarded = usePreferences((s) => s.onboardingComplete)
  const takingOver = useIsTakingOver()
  useTakeoverHold('contact-import', pendingUrls.length > 0)

  useEffect(() => {
    const queue = (url: string | null) => {
      if (url) setPendingUrls((urls) => [...urls, url])
    }
    if (!handledInitialUrl.current) {
      handledInitialUrl.current = true
      launchURL()
        .then((initial) => {
          logger.log(
            '[ContactImportListener] getInitialURL resolved =',
            redactLink(initial)
          )
          queue(initial)
        })
        .catch((error) => {
          logger.error('[ContactImportListener] getInitialURL error:', error)
        })
    }
    const sub = Linking.addEventListener('url', ({ url }) => {
      logger.log(
        '[ContactImportListener] url event fired, url =',
        redactLink(url)
      )
      queue(url)
    })
    return () => sub.remove()
  }, [])

  useEffect(() => {
    if (pendingUrls.length === 0 || !onboarded || takingOver) return
    const [url] = pendingUrls
    setPendingUrls((urls) => urls.slice(1))
    const handle = async (url: string | null) => {
      if (!url) return

      const result = await importContactFromIncomingUrl(url)
      if (!result) return
      if (!result.success || !result.data) {
        logger.warn('[ContactImportListener] refused an invalid contact share')
        Alert.alert(
          result.errorTitle || i18n.t('invalidFile'),
          result.error || i18n.t('invalidFile_description')
        )
        return
      }

      const finalImportData = result.data
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
                const {
                  contacts,
                  deletedContacts,
                  addContact,
                  updateContact,
                  recoverContact,
                  mergeIncomingCustomFieldDefs,
                } = useContacts.getState()
                const { addConversation, updateConversation } =
                  useConversations.getState()
                const callbacks: ImportHandlerCallbacks = {
                  addContact,
                  updateContact,
                  addConversation,
                  updateConversation,
                  recoverContact,
                  mergeIncomingCustomFieldDefs,
                  getConversations: () =>
                    useConversations.getState().conversations,
                  showToast: (title, message) =>
                    toast.success(title, { message }),
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

    void handle(url)
  }, [pendingUrls, onboarded, takingOver])

  return null
}
