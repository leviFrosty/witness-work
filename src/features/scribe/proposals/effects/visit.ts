import moment from 'moment'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET } from '@/stores/preferences'
import { reminderRequestId } from '@/lib/reminderSchedule'
import { offsetToMinutes, reminderFireDate } from '@/lib/notificationOffset'
import { parseDay } from '@/features/scribe/tools/shared'
import type { DraftEffectOf } from '@/features/scribe/proposals/model'
import type {
  ApplyContext,
  ApplyOutcome,
  UndoOutcome,
} from '@/features/scribe/proposals/effects/types'
import type { Visit } from '@/types/visit'

/**
 * `day` at the time of day it is now, as the Visit form's picker keeps the
 * current time when only the day changes.
 */
const atTimeOfDay = (day: string, now: Date): Date => {
  const time = moment(now)
  return parseDay(day)
    .hours(time.hours())
    .minutes(time.minutes())
    .seconds(0)
    .milliseconds(0)
    .toDate()
}

/** A Visit with the Visit form's Follow-up defaults (reminder per Preferences). */
export function applyVisitCreate(
  draft: DraftEffectOf<'visit.create'>,
  ctx: ApplyContext
): ApplyOutcome {
  const contactId =
    draft.contact.type === 'existing'
      ? draft.contact.id
      : ctx.bound.get(draft.contact.ref)
  if (
    !contactId ||
    !useContacts.getState().contacts.some((contact) => contact.id === contactId)
  )
    return { status: 'skipped', reason: 'missing' }
  const id = ctx.newId()
  let followUp: Visit['followUp']
  if (draft.followUp) {
    const date = atTimeOfDay(draft.followUp.date, ctx.now)
    const notifyMe = ctx.prefs.returnVisitAlwaysNotify
    const minutes = notifyMe
      ? offsetToMinutes(
          ctx.prefs.returnVisitNotificationOffset ??
            DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET
        )
      : null
    followUp = {
      date,
      notifyMe,
      ...(draft.followUp.topic ? { topic: draft.followUp.topic } : {}),
      reminderOffsetMinutes: minutes ?? undefined,
      notifications:
        minutes === null
          ? []
          : [
              {
                id: reminderRequestId('visit', id),
                date: reminderFireDate(date, minutes),
              },
            ],
    }
  }
  const visit: Visit = {
    id,
    contact: { id: contactId },
    date: atTimeOfDay(draft.date, ctx.now),
    isBibleStudy: draft.bibleStudy,
    ...(draft.notAtHome ? { notAtHome: true } : {}),
    ...(draft.note ? { note: draft.note } : {}),
    ...(followUp ? { followUp } : {}),
  }
  useConversations.getState().addConversation(visit)
  return { status: 'applied', undo: { kind: 'visit.create', visitId: id } }
}

export function undoVisitCreate(visitId: string): UndoOutcome {
  const { conversations, deleteConversation } = useConversations.getState()
  if (!conversations.some((visit) => visit.id === visitId)) return 'gone'
  deleteConversation(visitId)
  return 'undone'
}
