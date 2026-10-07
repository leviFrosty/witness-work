import { Alert } from 'react-native'
import { shareAsync } from 'expo-sharing'
import * as FileSystem from 'expo-file-system/legacy'
import moment from 'moment'
import { useToastController } from '@tamagui/toast'

import {
  buildContactShareLink,
  ContactShareLinkTooLargeError,
} from '@/features/contacts/lib/contactShareLink'
import { buildContactShareFile } from '@/features/contacts/lib/contactShareFormat'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
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
  // Same fields as the link; see `contactShareFormat.ts`.
  const jsonString = buildContactShareFile(contact, visits, customFieldDefs)
  const sanitizedName = contact.name.replace(/[^a-zA-Z0-9]/g, '_')
  const timestamp = moment().format('YYYY-MM-DD')
  const fileName = `${sanitizedName}_${timestamp}.witnesswork`
  // Cache dir (not document dir): iOS share-sheet attachments are passed by
  // reference, so we can't delete the file immediately after `Share.share`
  // resolves without blanking the iMessage attachment. Cache is purged by
  // the OS when needed.
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

/**
 * Share… for a Contact: a universal link carrying the contact and its recent
 * visits, falling back to a `.witnesswork` file (after asking) when the link
 * would be too large.
 *
 * Returns `undefined` in data protection mode. A share link gzips the whole
 * record — name, address, phone, and up to 50 visits with their notes — into a
 * URL the vendor's proxy resolves, and hands it to whoever the recipient
 * forwards it to. CJEU C-25/17 §45 is explicit that this makes the data
 * accessible to "a potentially unlimited number of persons", so the mode
 * removes the action entirely. Sharing an _address_ to Apple/Google Maps stays,
 * because that hand-off happens on-device.
 *
 * Cheap enough for every list row: visits and custom fields are read when the
 * share runs, not subscribed to.
 */
export default function useShareContact(contact: Contact | undefined) {
  const toast = useToastController()
  const dataProtectionMode = usePreferences((s) => s.dataProtectionMode)

  if (!contact || dataProtectionMode) return undefined

  return async () => {
    const visits = useConversations
      .getState()
      .conversations.filter((visit) => visit.contact.id === contact.id)
    const { customFieldDefs } = useContacts.getState()

    // Primary path: share a universal link. Tapping it on a device with the
    // app installed opens straight into the Contact Details screen; iOS
    // without the app falls through to the ww-proxy fallback HTML (App Store
    // CTA). Google-Maps-style "tap the bubble, open the app".
    try {
      const { url, includedConversations, trimmed } = buildContactShareLink(
        contact,
        visits,
        customFieldDefs
      )
      logger.log('[ContactShareLink] generated url =', url)
      logger.log('[ContactShareLink] length =', url.length, 'bytes')
      // Pass the URL as `url` (not embedded in `message`) so iOS fetches
      // Open Graph metadata from the ww-proxy fallback page and renders a
      // rich link preview in the share sheet + iMessage bubble. Passing
      // both fields causes some targets to duplicate the URL.
      await shareUrl(url, i18n.t('exportContact'))
      if (trimmed) {
        toast.show(i18n.t('shareContact'), {
          message: i18n.t('shareContactTrimmed', {
            included: includedConversations,
            total: visits.length,
          }),
          native: true,
        })
      }
    } catch (error) {
      if (error instanceof ContactShareLinkTooLargeError) {
        // Surface the situation explicitly: file export only works for
        // recipients who already have the app, unlike the universal link
        // which falls back to an App Store CTA. The user needs to make that
        // tradeoff themselves rather than us silently degrading.
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
      // Unexpected error from link build — surface it the same way so the
      // user isn't left wondering why nothing happened.
      logger.error('Unexpected error building contact share link:', error)
      Alert.alert(
        i18n.t('shareContactFileFailed_title'),
        i18n.t('shareContactFileFailed_description')
      )
    }
  }
}
