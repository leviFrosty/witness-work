import { useEffect, useRef } from 'react'
import { Alert, AppState } from 'react-native'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { deleteHouseholderContact } from '@/stores/householderData'
import { usePreferences } from '@/stores/preferences'
import {
  DATA_PROTECTION_RETENTION_DAYS,
  retentionCandidates,
  shouldPromptForRetention,
} from '@/lib/dataProtection'
import i18n from '@/lib/locales'

/**
 * Data protection mode's retention reminder (`docs/gdpr-mode-research.md`
 * §9.4). GDPR Art 5(1)(e) says personal data may be kept only as long as it is
 * needed for the purpose it was collected for; a householder the publisher has
 * not visited in three months is the textbook case of a record that has
 * outlived its purpose.
 *
 * Deliberately a single `Alert` on foreground rather than per-contact badges or
 * a review screen: the publisher should be able to resolve the whole question
 * in one tap. "Delete" routes each listed contact through
 * `deleteHouseholderContact`, which in this mode takes its visits and avatar
 * with it and leaves only a redacted tombstone. "Keep" resets the clock. Either
 * answer is recorded, so the prompt cannot appear again for another interval —
 * it must never become a nag.
 *
 * No-op when the mode is off.
 */
export const useDataProtectionRetentionPrompt = (enabled: boolean) => {
  // React state would re-render the app root on every foreground; the prompt is
  // imperative and needs only re-entrancy protection.
  const showing = useRef(false)

  useEffect(() => {
    if (!enabled) return

    const maybePrompt = () => {
      if (showing.current) return
      const prefs = usePreferences.getState()
      if (!prefs.dataProtectionMode) return
      if (!shouldPromptForRetention(prefs.dataProtectionRetentionPromptedAt)) {
        return
      }

      const stale = retentionCandidates({
        contacts: useContacts.getState().contacts,
        visits: useConversations.getState().conversations,
      })
      if (stale.length === 0) return

      showing.current = true
      const dismiss = () => {
        usePreferences.getState().markDataProtectionRetentionPrompted()
        showing.current = false
      }

      Alert.alert(
        i18n.t('dataProtectionRetentionTitle', {
          count: stale.length,
          days: DATA_PROTECTION_RETENTION_DAYS,
        }),
        i18n.t('dataProtectionRetentionDesc'),
        [
          {
            text: i18n.t('dataProtectionRetentionKeep'),
            style: 'cancel',
            onPress: dismiss,
          },
          {
            text: i18n.t('dataProtectionRetentionDelete', {
              count: stale.length,
            }),
            style: 'destructive',
            onPress: () => {
              for (const contact of stale) {
                deleteHouseholderContact(contact.id)
              }
              dismiss()
            },
          },
        ],
        { onDismiss: dismiss }
      )
    }

    maybePrompt()
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') maybePrompt()
    })
    return () => subscription.remove()
  }, [enabled])
}
