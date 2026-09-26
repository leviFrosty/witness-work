import { Alert, Share } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import moment from 'moment'
import { useToastController } from '@tamagui/toast'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { CustomFieldDefinition } from '@/types/customField'
import { usePreferences } from '@/stores/preferences'
import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'
import {
  buildContactShareLink,
  ContactShareLinkTooLargeError,
} from '@/features/contacts/lib/contactShareLink'

type ContactExport = {
  version: '1.0'
  type: 'witnesswork-contact'
  exportedAt: string
  contact: Contact
  conversations?: Visit[]
}

/**
 * Share a contact as a universal link, falling back (with the user's consent)
 * to a `.witnesswork` file when the link would be too large.
 */
const useContactShare = (
  contact: Contact | undefined,
  contactConversations: Visit[],
  customFieldDefs: CustomFieldDefinition[]
) => {
  const toast = useToastController()

  const shareContactAsFile = async () => {
    if (!contact || usePreferences.getState().dataProtectionMode) return
    // Drop per-device image avatar URIs — same policy as the universal-link
    // share (see contactShareLink.ts CONTACT_POLICY.avatar). The file path
    // points inside this device's FileSystem.documentDirectory and would be
    // dead on the recipient's device.
    let exportContact: Contact = contact
    if (contact.avatar?.type === 'image') {
      exportContact = { ...contact }
      delete exportContact.avatar
    }

    const exportData: ContactExport = {
      version: '1.0',
      type: 'witnesswork-contact',
      exportedAt: moment().toISOString(),
      contact: exportContact,
    }

    if (contactConversations.length > 0) {
      exportData.conversations = contactConversations.sort((a, b) =>
        moment(a.date).unix() < moment(b.date).unix() ? 1 : -1
      )
    }

    const jsonString = JSON.stringify(exportData, null, 2)
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
      await Share.share({
        url: fileUri,
        title: i18n.t('exportContact'),
      })
    } catch (error) {
      logger.error('Error sharing contact file:', error)
      Alert.alert(
        i18n.t('shareContactFileFailed_title'),
        i18n.t('shareContactFileFailed_description')
      )
    }
  }

  const handleExportContact = async () => {
    // Data protection mode turns contact sharing off. Callers hide the share
    // button too; this keeps the link from being built if one slips through.
    if (!contact || usePreferences.getState().dataProtectionMode) return

    // Primary path: share a universal link. Tapping it on a device with the
    // app installed opens straight into the Contact Details screen; iOS
    // without the app falls through to the ww-proxy fallback HTML (App Store
    // CTA). Google-Maps-style "tap the bubble, open the app".
    try {
      const { url, includedConversations, trimmed } = buildContactShareLink(
        contact,
        contactConversations,
        customFieldDefs
      )
      logger.log('[ContactShareLink] generated url =', url)
      logger.log('[ContactShareLink] length =', url.length, 'bytes')
      // Pass the URL as `url` (not embedded in `message`) so iOS fetches
      // Open Graph metadata from the ww-proxy fallback page and renders a
      // rich link preview in the share sheet + iMessage bubble. Passing
      // both fields causes some targets to duplicate the URL.
      await Share.share({
        url,
        title: i18n.t('exportContact'),
      })
      if (trimmed) {
        toast.show(i18n.t('shareContact'), {
          message: i18n.t('shareContactTrimmed', {
            included: includedConversations,
            total: contactConversations.length,
          }),
          native: true,
        })
      }
      return
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
                void shareContactAsFile()
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

  return handleExportContact
}

export default useContactShare
