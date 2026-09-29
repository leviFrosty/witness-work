import moment from 'moment'
import { CalendarX as CalendarXIcon } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import { overdueFollowUpConversations } from '@/lib/conversations'
import i18n from '@/lib/locales'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import type { NotificationItem } from '@/types/notifications'
import type { RootStackNavigation } from '@/types/rootStack'

/**
 * One tray item per missed Follow-up. Mirrors the widget's 30-day lookback, and
 * clears once the Follow-up is rescheduled, logged, or dismissed.
 */
export default function useMissedFollowUpNotifications(
  now: number
): NotificationItem[] {
  const navigation = useNavigation<RootStackNavigation>()
  const { conversations } = useConversations()
  const { contacts } = useContacts()

  const names = new Map(contacts.map((contact) => [contact.id, contact.name]))
  return overdueFollowUpConversations({
    currentTime: new Date(now),
    conversations,
    lookbackDays: 30,
  }).flatMap((visit): NotificationItem[] => {
    const name = names.get(visit.contact.id)
    if (name === undefined || !visit.followUp) return []
    const at = moment(visit.followUp.date).valueOf()
    return [
      {
        // A rescheduled Follow-up that's missed again is a new occurrence.
        id: `missed_follow_up:${visit.id}:${at}`,
        kind: 'missed_follow_up',
        at,
        icon: CalendarXIcon,
        tone: 'warn',
        title: i18n.t('notifications_missedFollowUp', { name }),
        description: visit.followUp.topic || undefined,
        actions: [
          {
            id: 'reschedule',
            label: i18n.t('reschedule'),
            onPress: () =>
              navigation.navigate('RescheduleVisit', {
                contactId: visit.contact.id,
                visitId: visit.id,
              }),
          },
        ],
      },
    ]
  })
}
