import { Alert } from 'react-native'
import { ShieldCheck as ShieldCheckIcon } from 'lucide-react-native'
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
import type { NotificationItem } from '@/types/notifications'
import { useShallow } from 'zustand/react/shallow'

export default function useDataProtectionRetentionNotification(
  now: number
): NotificationItem | null {
  const {
    dataProtectionMode,
    dataProtectionRetentionPromptedAt,
    markDataProtectionRetentionPrompted,
  } = usePreferences(
    useShallow((s) => ({
      dataProtectionMode: s.dataProtectionMode,
      dataProtectionRetentionPromptedAt: s.dataProtectionRetentionPromptedAt,
      markDataProtectionRetentionPrompted:
        s.markDataProtectionRetentionPrompted,
    }))
  )
  const contacts = useContacts((state) => state.contacts)
  const visits = useConversations((state) => state.conversations)
  if (
    !dataProtectionMode ||
    !shouldPromptForRetention(dataProtectionRetentionPromptedAt, now)
  )
    return null

  const count = retentionCandidates({ contacts, visits, now }).length
  if (count === 0) return null

  const title = i18n.t('dataProtectionRetentionTitle', {
    count,
    days: DATA_PROTECTION_RETENTION_DAYS,
  })
  const deleteStale = () => {
    const stale = retentionCandidates({
      contacts: useContacts.getState().contacts,
      visits: useConversations.getState().conversations,
    })
    for (const contact of stale) deleteHouseholderContact(contact.id)
    markDataProtectionRetentionPrompted()
  }

  return {
    id: `data_protection_retention:${dataProtectionRetentionPromptedAt ?? 'never'}`,
    kind: 'data_protection_retention',
    icon: ShieldCheckIcon,
    tone: 'warn',
    title,
    description: i18n.t('dataProtectionRetentionDesc'),
    actions: [
      {
        id: 'delete',
        label: i18n.t('dataProtectionRetentionDelete', { count }),
        onPress: () =>
          Alert.alert(title, i18n.t('dataProtectionRetentionDeleteConfirm'), [
            { text: i18n.t('cancel'), style: 'cancel' },
            {
              text: i18n.t('dataProtectionRetentionDelete', { count }),
              style: 'destructive',
              onPress: deleteStale,
            },
          ]),
      },
      {
        id: 'keep',
        label: i18n.t('dataProtectionRetentionKeep'),
        inPlace: true,
        onPress: () => markDataProtectionRetentionPrompted(),
      },
    ],
    onDismiss: () => markDataProtectionRetentionPrompted(),
  }
}
