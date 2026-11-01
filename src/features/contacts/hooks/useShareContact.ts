import { Alert } from 'react-native'
import { shareAsync } from 'expo-sharing'
import * as FileSystem from 'expo-file-system/legacy'
import moment from 'moment'
import { toast } from '@/stores/toasts'

import {
  buildContactShareLink,
  ContactShareLinkTooLargeError,
} from '@/features/contacts/lib/contactShareLink'
import { buildContactShareFile } from '@/features/contacts/lib/contactShareFormat'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { redactLink } from '@/lib/redactLink'
import { shareUrl } from '@/lib/share'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import type { Contact } from '@/types/contact'
import type { CustomFieldDefinition } from '@/types/customField'
import type { Visit } from '@/types/visit'

const shareContactAsFile = async (
  contact: Contact,
  visits: Visit[],
  customFieldDefs: CustomFieldDefinition[]
) => {
  const jsonString = buildContactShareFile(contact, visits, customFieldDefs)
  const sanitizedName = contact.name.replace(/[^a-zA-Z0-9]/g, '_')
  const timestamp = moment().format('YYYY-MM-DD')
  const fileName = `${sanitizedName}_${timestamp}.witnesswork`

  const fileUri = `${FileSystem.cacheDirectory}${fileName}`

  try {
    await FileSystem.writeAsStringAsync(fileUri, jsonString)
    await shareAsync(fileUri, {
      mimeType: 'application/witnesswork+json',
      UTI: 'com.leviwilkerson.witnesswork.contact',
      dialogTitle: i18n.t('exportContact'),
    })
  } catch (error) {
    logger.error('Error sharing contact file:', error)
    Alert.alert(
      i18n.t('shareContactFileFailed_title'),
      i18n.t('shareContactFileFailed_description')
    )
  }
}

export default function useShareContact(contact: Contact | undefined) {
  const dataProtectionMode = usePreferences((s) => s.dataProtectionMode)

  if (!contact || dataProtectionMode) return undefined

  return async () => {
    const visits = useConversations
      .getState()
      .conversations.filter((visit) => visit.contact.id === contact.id)
    const { customFieldDefs } = useContacts.getState()

    try {
      const { url, includedConversations, trimmed } = buildContactShareLink(
        contact,
        visits,
        customFieldDefs
      )
      logger.log('[ContactShareLink] generated url =', redactLink(url))
      logger.log('[ContactShareLink] length =', url.length, 'bytes')

      await shareUrl(url, i18n.t('exportContact'))
      if (trimmed) {
        toast.info(i18n.t('shareContact'), {
          message: i18n.t('shareContactTrimmed', {
            included: includedConversations,
            total: visits.length,
          }),
        })
      }
    } catch (error) {
      if (error instanceof ContactShareLinkTooLargeError) {
        logger.log(
          '[ContactShareLink] payload too large, prompting user',
          error.bareUrlBytes,
          '/',
          error.maxUrlBytes
        )
        Alert.alert(
          i18n.t('shareContactTooLarge_title'),
          i18n.t('shareContactTooLarge_description'),
          [
            { text: i18n.t('cancel'), style: 'cancel' },
            {
              text: i18n.t('shareContactTooLarge_shareAsFile'),
              onPress: () => {
                void shareContactAsFile(contact, visits, customFieldDefs)
              },
            },
          ]
        )
        return
      }

      logger.error('Unexpected error building contact share link:', error)
      Alert.alert(
        i18n.t('shareContactFileFailed_title'),
        i18n.t('shareContactFileFailed_description')
      )
    }
  }
}
