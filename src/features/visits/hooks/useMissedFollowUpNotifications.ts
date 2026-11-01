import moment from 'moment'
import { CalendarX as CalendarXIcon } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import {
  MISSED_FOLLOW_UP_LOOKBACK_DAYS,
  overdueFollowUpConversations,
} from '@/lib/conversations'
import i18n from '@/lib/locales'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import type { NotificationItem } from '@/types/notifications'
import type { RootStackNavigation } from '@/types/rootStack'

export default function useMissedFollowUpNotifications(
  now: number
): NotificationItem[] {
  const navigation = useNavigation<RootStackNavigation>()
  const conversations = useConversations((state) => state.conversations)
  const contacts = useContacts((state) => state.contacts)

  const missed = overdueFollowUpConversations({
    currentTime: new Date(now),
    conversations,
    lookbackDays: MISSED_FOLLOW_UP_LOOKBACK_DAYS,
  })
  if (missed.length === 0) return []

  const wanted = new Set(missed.map((visit) => visit.contact.id))
  const names = new Map<string, string>()
  for (const contact of contacts)
    if (wanted.has(contact.id)) names.set(contact.id, contact.name)
  return missed.flatMap((visit): NotificationItem[] => {
    const name = names.get(visit.contact.id)
    if (name === undefined || !visit.followUp) return []
    const at = moment(visit.followUp.date).valueOf()
    return [
      {
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
