import * as Notifications from 'expo-notifications'
import moment from 'moment'
import _ from 'lodash'
import { Conversation, Notification } from '../types/conversation'
import i18n from './locales'

export type NotificationsAdapter = {
  scheduleNotificationAsync: (
    request: Notifications.NotificationRequestInput
  ) => Promise<string>
  cancelScheduledNotificationAsync: (id: string) => Promise<void>
}

export type ReminderOffset = {
  amount?: number
  unit?: moment.unitOfTime.DurationConstructor
}

export type SyncInput = {
  conversation: Conversation
  previous?: Conversation
  contactName: string
  notifyMeOffset: ReminderOffset
  pickEmoji?: () => string
  onError?: (error: unknown) => void
}

const defaultAdapter: NotificationsAdapter = {
  scheduleNotificationAsync: Notifications.scheduleNotificationAsync,
  cancelScheduledNotificationAsync:
    Notifications.cancelScheduledNotificationAsync,
}

export const sync = async (
  input: SyncInput,
  adapter: NotificationsAdapter = defaultAdapter
): Promise<Notification[]> => {
  const { conversation, previous, contactName, notifyMeOffset } = input
  if (!conversation.followUp) return []

  // Deep-equal short-circuit: if nothing about the follow-up changed we keep
  // the existing scheduled OS notifications untouched. Mirrors the prior
  // ConversationFormScreen behavior where a save with no follow-up edits did
  // not cancel-and-reschedule.
  const followUpUnchanged =
    previous?.followUp !== undefined &&
    _.isEqual(previous.followUp, conversation.followUp)
  if (followUpUnchanged) {
    return conversation.followUp.notifications ?? []
  }

  // Follow-up changed (date, notifyMe, topic, …): cancel any prior reminders
  // before deciding whether to schedule a fresh one. Mirrors the prior
  // ConversationFormScreen flow. allSettled keeps a single bad cancel from
  // bringing down the whole save (the screen's previous fire-and-forget
  // forEach had the same fault tolerance).
  const priorNotifications = previous?.followUp?.notifications ?? []
  await Promise.allSettled(
    priorNotifications.map(({ id }) =>
      adapter.cancelScheduledNotificationAsync(id)
    )
  )

  if (!conversation.followUp.notifyMe) return []

  const triggerDate = moment(conversation.followUp.date)
    .subtract(notifyMeOffset.amount, notifyMeOffset.unit)
    .toDate()

  if (!moment(triggerDate).isAfter(moment())) {
    return []
  }

  const emoji = input.pickEmoji ? input.pickEmoji() : ''
  const topic = conversation.followUp.topic
  const body = `${i18n.t('notification_part1')} ${contactName} ${i18n.t(
    'notification_part2'
  )} ${notifyMeOffset.amount} ${notifyMeOffset.unit}. ${emoji}${
    topic && `${i18n.t('reminder_topic')}${topic}`
  }`

  try {
    const id = await adapter.scheduleNotificationAsync({
      content: {
        title: i18n.t('reminder_title'),
        body,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      },
    })
    return [{ date: triggerDate, id }]
  } catch (error) {
    input.onError?.(error)
    return []
  }
}

export const cancel = async (
  notifications: Notification[] | undefined,
  adapter: NotificationsAdapter = defaultAdapter
): Promise<void> => {
  if (!notifications || notifications.length === 0) return
  await Promise.allSettled(
    notifications.map(({ id }) => adapter.cancelScheduledNotificationAsync(id))
  )
}
