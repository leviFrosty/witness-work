import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import {
  DEFAULT_PLAN_NOTIFICATION_OFFSET,
  DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET,
  usePreferences,
} from '@/stores/preferences'
import { buildCalendarSnapshot } from '@/app/calendar/snapshot'
import i18n from '@/lib/locales'
import { addressToString } from '@/lib/address'
import { reminderOccurrences } from '@/lib/reminderSchedule'

/** The calendar projection of the current app data, for either platform. */
export function currentCalendarSnapshot({
  publishedKeys,
  includeDetails,
}: {
  publishedKeys: string[]
  includeDetails: boolean
}) {
  const contacts = useContacts.getState()
  const visits = useConversations.getState()
  const preferences = usePreferences.getState()
  // The same reminders the app schedules, so calendar alerts always match.
  const alertMinutes = new Map<string, number>()
  for (const reminder of reminderOccurrences({
    contacts: contacts.contacts,
    visits: visits.conversations,
    plans: [],
    visitOffset: {
      ...DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET,
      ...preferences.returnVisitNotificationOffset,
    },
    planOffset: DEFAULT_PLAN_NOTIFICATION_OFFSET,
  })) {
    const minutes = Math.round(
      (reminder.anchor.getTime() - reminder.date.getTime()) / 60_000
    )
    if (reminder.kind === 'visit' && minutes >= 0)
      alertMinutes.set(reminder.targetId, minutes)
  }
  return buildCalendarSnapshot({
    visits: visits.conversations,
    deletedVisits: visits.deletedConversations,
    contacts: contacts.contacts.map((contact) => ({
      ...contact,
      address: addressToString(contact.address),
    })),
    deletedContactIds: contacts.deletedContacts.map((contact) => contact.id),
    publishedKeys,
    includeDetails,
    alertMinutes,
    title: i18n.t('calendarFollowUpTitle'),
  })
}
