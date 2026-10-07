import type * as Notifications from 'expo-notifications'

export type ReminderKind =
  | 'visit'
  | 'plan'
  | 'contact'
  | 'unloggedDay'
  | 'streak'

/**
 * What a local reminder carries so a tap can open its record. Ids only — the
 * text lives in the alert itself and in the app's own stores.
 */
export type ReminderData = {
  kind: ReminderKind
  /**
   * Visit, Plan, or Contact id; a planned day (`YYYY-MM-DD`) to log time; the
   * day or month (its 1st) a streak waits on.
   */
  id: string
  /** The Visit's Contact, so a Follow-up reminder opens its Contact. */
  contactId?: string
}

export type BuddiesPushData = {
  kind: string
  /** The relay event's inbox sequence, when the relay sent one. */
  seq?: number
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined
}

/**
 * The `ww` marker of a Buddies push (they carry no user content), or null for
 * any other notification. Remote payloads arrive on the trigger on iOS and in
 * `data` elsewhere.
 */
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
    kind !== 'streak'
  )
    return null
  return {
    kind,
    id: reminder.id,
    ...(typeof reminder.contactId === 'string'
      ? { contactId: reminder.contactId }
      : {}),
  }
}
