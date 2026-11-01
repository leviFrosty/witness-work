import type * as Notifications from 'expo-notifications'

export type ReminderKind =
  | 'visit'
  | 'plan'
  | 'contact'
  | 'unloggedDay'
  | 'streak'
  | 'monthReport'
  | 'weekPlan'

export type ReminderData = {
  kind: ReminderKind

  id: string

  contactId?: string

  day?: string
}

export type BuddiesPushData = {
  kind: string

  seq?: number
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined
}

export function buddiesPushData(
  notification: Notifications.Notification
): BuddiesPushData | null {
  const trigger = record(notification.request.trigger)
  const payload = trigger?.type === 'push' ? record(trigger.payload) : undefined
  const marker = record(
    payload?.ww ?? record(notification.request.content.data)?.ww
  )
  if (!marker) return null
  const kind = typeof marker.kind === 'string' ? marker.kind : ''
  const seq =
    typeof marker.seq === 'number' && Number.isSafeInteger(marker.seq)
      ? marker.seq
      : undefined
  return seq === undefined ? { kind } : { kind, seq }
}

export function reminderData(
  notification: Notifications.Notification
): ReminderData | null {
  const reminder = record(record(notification.request.content.data)?.reminder)
  if (!reminder || typeof reminder.id !== 'string') return null
  const kind = reminder.kind
  if (
    kind !== 'visit' &&
    kind !== 'plan' &&
    kind !== 'contact' &&
    kind !== 'unloggedDay' &&
    kind !== 'streak' &&
    kind !== 'monthReport' &&
    kind !== 'weekPlan'
  )
    return null
  return {
    kind,
    id: reminder.id,
    ...(typeof reminder.contactId === 'string'
      ? { contactId: reminder.contactId }
      : {}),
    ...(typeof reminder.day === 'string' ? { day: reminder.day } : {}),
  }
}
