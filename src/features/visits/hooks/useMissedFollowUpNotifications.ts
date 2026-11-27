import moment from 'moment'
import { CalendarX as CalendarXIcon } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import useDismissFollowUp from '@/hooks/useDismissFollowUp'
import { isAutoReschedulePaused } from '@/lib/autoRescheduleFollowUps'
import {
  MISSED_FOLLOW_UP_LOOKBACK_DAYS,
  overdueFollowUpConversations,
} from '@/lib/conversations'
import i18n from '@/lib/locales'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import type { NotificationItem } from '@/types/notifications'
import type { RootStackNavigation } from '@/types/rootStack'

export default function useMissedFollowUpNotifications(
  now: number
): NotificationItem[] {
  const navigation = useNavigation<RootStackNavigation>()
  const dismissFollowUp = useDismissFollowUp()
  const autoRescheduleEnabled = usePreferences(
    (s) => s.autoRescheduleMissedFollowUps
  )
  const autoRescheduleMaxCount = usePreferences((s) => s.autoRescheduleMaxCount)
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
    const paused =
      autoRescheduleEnabled &&
      isAutoReschedulePaused(visit, autoRescheduleMaxCount)
    const count = visit.followUp.autoRescheduleCount ?? 0
    const topic = visit.followUp.topic?.trim() || undefined
    const pausedDesc = i18n.t('notifications_autoReschedulePaused_desc', {
      count,
    })

    return [
      {
        id: `missed_follow_up:${visit.id}:${at}`,
        kind: 'missed_follow_up',
        at,
        icon: CalendarXIcon,
        tone: 'warn',
        title: paused
          ? i18n.t('notifications_autoReschedulePaused', { name })
          : i18n.t('notifications_missedFollowUp', { name }),
        description: paused
          ? topic
            ? `${pausedDesc}\n${topic}`
            : pausedDesc
          : topic,
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
          ...(paused
            ? [
                {
                  id: 'dismiss_follow_up',
                  label: i18n.t('dismiss'),
                  inPlace: true,
                  onPress: () => dismissFollowUp(visit),
                },
              ]
            : []),
        ],
      },
    ]
  })
}
