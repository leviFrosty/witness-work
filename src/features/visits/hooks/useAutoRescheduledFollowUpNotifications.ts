import moment from 'moment'
import { RefreshCw as RefreshCwIcon } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import { analytics } from '@/lib/analytics'
import {
  AUTO_RESCHEDULE_TRAY_WINDOW_MS,
  undoAutoReschedule,
} from '@/lib/autoRescheduleFollowUps'
import {
  followUpAnswer,
  isAppointment,
  visitsByContact,
} from '@/lib/conversations'
import { formatMonthDayCompact, formatTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import { visitDayLabel } from '@/lib/visitDates'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import {
  DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET,
  usePreferences,
} from '@/stores/preferences'
import { toast } from '@/stores/toasts'
import type { NotificationItem } from '@/types/notifications'
import type { RootStackNavigation } from '@/types/rootStack'

export default function useAutoRescheduledFollowUpNotifications(
  now: number
): NotificationItem[] {
  const navigation = useNavigation<RootStackNavigation>()
  const enabled = usePreferences((s) => s.autoRescheduleMissedFollowUps)
  const maxCount = usePreferences((s) => s.autoRescheduleMaxCount)
  const returnVisitNotificationOffset = usePreferences(
    (s) => s.returnVisitNotificationOffset
  )
  const conversations = useConversations((s) => s.conversations)
  const updateConversation = useConversations((s) => s.updateConversation)
  const contacts = useContacts((s) => s.contacts)

  if (!enabled) return []

  const recent = conversations.filter((visit) => {
    if (!isAppointment(visit) || !visit.followUp) return false
    const { autoRescheduledFrom, autoRescheduledAt, date } = visit.followUp
    if (!autoRescheduledFrom || !autoRescheduledAt) return false
    if (now - autoRescheduledAt > AUTO_RESCHEDULE_TRAY_WINDOW_MS) return false
    return new Date(date).getTime() > now
  })

  if (recent.length === 0) return []

  const contactIds = new Set(recent.map((visit) => visit.contact.id))
  const byContact = visitsByContact(conversations, contactIds)
  const names = new Map<string, string>()
  for (const contact of contacts) {
    if (contactIds.has(contact.id)) names.set(contact.id, contact.name)
  }

  return recent.flatMap((visit): NotificationItem[] => {
    const followUp = visit.followUp
    const name = names.get(visit.contact.id)
    if (!followUp?.autoRescheduledFrom || !followUp.autoRescheduledAt || !name)
      return []
    if (followUpAnswer(visit, byContact.get(visit.contact.id) ?? [])) return []

    const nextDate = new Date(followUp.date)
    const fromDate = new Date(followUp.autoRescheduledFrom)
    const count = followUp.autoRescheduleCount ?? 1
    const when = `${visitDayLabel(nextDate, new Date(now))} · ${formatTime(nextDate)}`
    const fromLabel = formatMonthDayCompact(moment(fromDate))
    const description =
      maxCount !== null
        ? i18n.t('notifications_autoRescheduledFollowUp_descCount', {
            from: fromLabel,
            count,
            max: maxCount,
          })
        : i18n.t('notifications_autoRescheduledFollowUp_desc', {
            from: fromLabel,
          })

    return [
      {
        id: `auto_rescheduled_follow_up:${visit.id}:${followUp.autoRescheduledAt}`,
        kind: 'auto_rescheduled_follow_up',
        at: followUp.autoRescheduledAt,
        icon: RefreshCwIcon,
        tone: 'accent',
        title: i18n.t('notifications_autoRescheduledFollowUp', { name, when }),
        description,
        actions: [
          {
            id: 'log_visit',
            label: i18n.t('logVisit'),
            onPress: () =>
              navigation.navigate('Visit Form', {
                contactId: visit.contact.id,
                followUpVisitId: visit.id,
                returnOnSave: true,
              }),
          },
          {
            id: 'change',
            label: i18n.t('autoRescheduleChange'),
            onPress: () =>
              navigation.navigate('RescheduleVisit', {
                contactId: visit.contact.id,
                visitId: visit.id,
              }),
          },
          {
            id: 'undo',
            label: i18n.t('undo'),
            inPlace: true,
            onPress: () => {
              const reverted = undoAutoReschedule(visit, {
                ...DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET,
                ...returnVisitNotificationOffset,
              })
              if (!reverted) return
              updateConversation(reverted)
              analytics.capture('follow_up_auto_reschedule_undone', {
                count,
              })
              toast.success(
                i18n.t('autoRescheduleUndone', {
                  name,
                  date: fromLabel,
                })
              )
            },
          },
        ],
      },
    ]
  })
}
