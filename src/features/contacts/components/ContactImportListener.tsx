import { useEffect, useRef, useState } from 'react'
import { Alert } from 'react-native'
import * as Linking from 'expo-linking'
import { useToastController } from '@tamagui/toast'
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
import { useIsTakingOver, useTakeoverHold } from '@/hooks/useTakeoverTurn'
import { usePreferences } from '@/stores/preferences'

/**
 * Handles two kinds of incoming contact URLs:
 *
 * 1. `https://ww-proxy.leviwilkerson.com/c#<payload>` — Universal Link from a
 *    shared contact (decoded via `parseContactShareLink`, which also accepts
 *    the legacy `/c/<payload>` and `witnesswork://import-contact/<payload>`
 *    forms).
 * 2. `file://…/<name>.witnesswork` — file attachment tapped from Files / iMessage
 *    / AirDrop (registered via `CFBundleDocumentTypes`).
 *
 * Both go through `importContactFromIncomingUrl`, which validates them the same
 * way, then show a confirm dialog, run the existing import flow, and navigate
 * to the imported contact.
 */
export default function ContactImportListener() {
  const toast = useToastController()
  // `getInitialURL` keeps returning the launch URL for the app's lifetime, so
  // handle it once — otherwise a re-run of the effect re-prompts the import.
  const handledInitialUrl = useRef(false)
  // Links wait for onboarding and for whatever is taking over the screen (the
  // update reveal) before asking to import (ADR 0021).
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
      Linking.getInitialURL()
        .then((initial) => {
          logger.log(
            '[ContactImportListener] getInitialURL resolved =',
            initial
          )
          queue(initial)
        })
        .catch((error) => {
          logger.error('[ContactImportListener] getInitialURL error:', error)
        })
    }
    const sub = Linking.addEventListener('url', ({ url }) => {
      logger.log('[ContactImportListener] url event fired, url =', url)
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
                // Read the stores at tap time so the effect doesn't depend on
                // (and re-run with) contact state.
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

    void handle(url)
  }, [pendingUrls, onboarded, takingOver, toast])

  return null
}
