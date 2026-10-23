import { toast } from '@/stores/toasts'

import { analytics } from '@/lib/analytics'
import confirmDestructive from '@/lib/confirmDestructive'
import i18n from '@/lib/locales'
import {
  deleteHouseholderContacts,
  permanentlyDeleteHouseholderContacts,
} from '@/stores/householderData'
import { usePreferences } from '@/stores/preferences'
import type { Contact } from '@/types/contact'

/**
 * Archive and Delete for Contacts, each behind its confirmation.
 *
 * Archive hides a Contact and keeps it and its conversations, restorable from
 * Recover Contacts for 90 days. Delete erases the Contact and its conversations
 * on every synced device with no way back, so its confirmation says so and
 * offers Archive Instead. Data protection mode keeps nothing to recover, so it
 * has no Archive (`canArchive`), only Delete.
 */
export default function useRemoveContacts() {
  const dataProtectionMode = usePreferences((s) => s.dataProtectionMode)

  const archiveNow = (contacts: Contact[], onDone?: () => void) => {
    deleteHouseholderContacts(contacts.map((c) => c.id))
    toast.success(i18n.t('success'), {
      message: i18n.t('archived'),
    })
    onDone?.()
  }

  const archive = (contacts: Contact[], onDone?: () => void) => {
    if (!contacts.length) return
    const count = contacts.length
    confirmDestructive({
      title:
        count === 1
          ? i18n.t('archiveContact_question')
          : // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
            i18n.t('archiveContacts_question', { count }),
      description: i18n.t(
        count === 1
          ? 'archiveContact_description'
          : 'archiveContacts_description'
      ),
      confirmLabel: i18n.t('archive'),
      onConfirm: () => archiveNow(contacts, onDone),
    })
  }

  const remove = (contacts: Contact[], onDone?: () => void) => {
    if (!contacts.length) return
    const count = contacts.length
    const warning = dataProtectionMode
      ? count === 1
        ? 'permanentlyDeleteContact_warning'
        : 'permanentlyDeleteContacts_warning'
      : count === 1
        ? 'deleteContactOrArchive_warning'
        : 'deleteContactsOrArchive_warning'
    confirmDestructive({
      title:
        count === 1
          ? i18n.t('permanentlyDeleteContact_question', {
              name: contacts[0].name,
            })
          : // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
            i18n.t('deleteContacts_question', { count }),
      description: i18n.t(warning),
      confirmLabel: i18n.t('deletePermanently'),
      alternative: dataProtectionMode
        ? undefined
        : {
            label: i18n.t('archiveInstead'),
            onPress: () => archiveNow(contacts, onDone),
          },
      onConfirm: () => {
        permanentlyDeleteHouseholderContacts(contacts.map((c) => c.id))
        analytics.capture('contact_deleted', { count })
        toast.success(i18n.t('success'), {
          message: i18n.t('deleted'),
        })
        onDone?.()
      },
    })
  }

  return { canArchive: !dataProtectionMode, archive, remove }
}
