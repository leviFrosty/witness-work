import useServiceReport from '@/stores/serviceReport'
import { DEFAULT_PLAN_NOTIFICATION_OFFSET } from '@/stores/preferences'
import {
  combineDateAndStartTime,
  DEFAULT_START_TIME_IN_MINUTES,
  storedDayKey,
} from '@/lib/normalizeDate'
import {
  anytimePlanReminderDate,
  reminderRequestId,
  savedReminderOffsetMinutes,
} from '@/lib/reminderSchedule'
import { offsetToMinutes, reminderFireDate } from '@/lib/notificationOffset'
import { localDate } from '@/features/scribe/tools/shared'
import type { DraftEffectOf } from '@/features/scribe/proposals/model'
import type {
  ApplyContext,
  ApplyOutcome,
  PlanSnapshot,
  UndoOutcome,
} from '@/features/scribe/proposals/effects/types'
import { resolveCategoryId } from '@/features/scribe/proposals/effects/category'
import type { DayPlan } from '@/types/timeEntry'

type ReminderFields = Pick<
  DayPlan,
  'notifyMe' | 'reminderOffsetMinutes' | 'notifications'
>

/**
 * The reminder intent the Plan form saves (`useReconciledReminders` schedules
 * this device's OS reminder from it): an anytime Plan reminds the morning of, a
 * timed one `offsetMinutes` before its start.
 */
function reminderFields(
  planId: string,
  day: Date,
  startMinutes: number | null,
  notifyMe: boolean,
  offsetMinutes: number | null
): ReminderFields {
  if (notifyMe && startMinutes === null)
    return {
      notifyMe,
      reminderOffsetMinutes: undefined,
      notifications: [
        {
          id: reminderRequestId('plan', planId),
          date: anytimePlanReminderDate(day),
        },
      ],
    }
  if (!notifyMe || offsetMinutes === null)
    return { notifyMe, reminderOffsetMinutes: undefined, notifications: [] }
  return {
    notifyMe,
    reminderOffsetMinutes: offsetMinutes,
    // The fire time, for older app versions on other devices.
    notifications: [
      {
        id: reminderRequestId('plan', planId),
        date: reminderFireDate(
          combineDateAndStartTime(day, startMinutes ?? undefined),
          offsetMinutes
        ),
      },
    ],
  }
}

/** A Day Plan with the Plan form's defaults (reminder per Preferences). */
export function applyPlanCreate(
  draft: DraftEffectOf<'plan.create'>,
  ctx: ApplyContext
): ApplyOutcome {
  const categoryId = resolveCategoryId(draft.category, ctx)
  if (categoryId === undefined) return { status: 'skipped', reason: 'missing' }
  const id = ctx.newId()
  const day = localDate(draft.date)
  const plan: DayPlan = {
    id,
    date: day,
    minutes: draft.minutes,
    // An anytime Plan keeps the noon default, so older app versions show it
    // as a noon Plan.
    startTimeInMinutes: draft.anytime
      ? DEFAULT_START_TIME_IN_MINUTES
      : (draft.startMinutes ?? DEFAULT_START_TIME_IN_MINUTES),
    ...(draft.anytime ? { anytime: true } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(draft.title ? { title: draft.title } : {}),
    ...(draft.note ? { note: draft.note } : {}),
    ...reminderFields(
      id,
      day,
      draft.anytime ? null : draft.startMinutes,
      ctx.prefs.planAlwaysNotify,
      offsetToMinutes(
        ctx.prefs.planNotificationOffset ?? DEFAULT_PLAN_NOTIFICATION_OFFSET
      )
    ),
  }
  useServiceReport.getState().addDayPlan(plan)
  return { status: 'applied', undo: { kind: 'plan.create', planId: id } }
}

export function undoPlanCreate(planId: string): UndoOutcome {
  const { dayPlans, deleteDayPlan } = useServiceReport.getState()
  if (!dayPlans.some((plan) => plan.id === planId)) return 'gone'
  deleteDayPlan(planId)
  return 'undone'
}

const findPlan = (id: string) =>
  useServiceReport.getState().dayPlans.find((plan) => plan.id === id)

const snapshotOf = (plan: DayPlan): PlanSnapshot => ({
  date: storedDayKey(plan.date),
  minutes: plan.minutes,
  startTimeInMinutes: plan.startTimeInMinutes ?? null,
  anytime: !!plan.anytime,
  title: plan.title ?? null,
  note: plan.note ?? null,
  noteDoc: plan.noteDoc ?? null,
  notifyMe: !!plan.notifyMe,
  reminderOffsetMinutes: plan.reminderOffsetMinutes ?? null,
  notifications: plan.notifications ?? null,
})

const fromSnapshot = (snapshot: PlanSnapshot): Partial<DayPlan> => ({
  date: localDate(snapshot.date),
  minutes: snapshot.minutes,
  startTimeInMinutes: snapshot.startTimeInMinutes ?? undefined,
  anytime: snapshot.anytime || undefined,
  title: snapshot.title ?? undefined,
  note: snapshot.note ?? undefined,
  noteDoc: snapshot.noteDoc ?? undefined,
  notifyMe: snapshot.notifyMe,
  reminderOffsetMinutes: snapshot.reminderOffsetMinutes ?? undefined,
  notifications: snapshot.notifications ?? undefined,
})

/** Re-checked against the Plan as it was read (Reconcile at Accept). */
export function applyPlanUpdate(
  draft: DraftEffectOf<'plan.update'>,
  ctx: ApplyContext
): ApplyOutcome {
  const plan = findPlan(draft.planId)
  if (!plan) return { status: 'skipped', reason: 'missing' }
  if ((plan.updatedAt ?? null) !== draft.expectUpdatedAt)
    return { status: 'skipped', reason: 'changed' }
  const before = snapshotOf(plan)
  const { set } = draft
  const anytime = set.anytime ?? !!plan.anytime
  const start = anytime
    ? null
    : set.startMinutes !== undefined && set.startMinutes !== null
      ? set.startMinutes
      : (plan.startTimeInMinutes ?? DEFAULT_START_TIME_IN_MINUTES)
  const dayKey = set.date ?? storedDayKey(plan.date)
  const day = localDate(dayKey)
  const offset = plan.notifyMe
    ? (plan.reminderOffsetMinutes ??
      savedReminderOffsetMinutes(
        combineDateAndStartTime(plan.date, plan.startTimeInMinutes),
        plan
      ) ??
      offsetToMinutes(
        ctx.prefs.planNotificationOffset ?? DEFAULT_PLAN_NOTIFICATION_OFFSET
      ))
    : null
  const changes: Partial<DayPlan> = {
    id: plan.id,
    ...(set.date !== undefined ? { date: day } : {}),
    ...(set.minutes !== undefined ? { minutes: set.minutes } : {}),
    ...(set.anytime !== undefined || set.startMinutes !== undefined
      ? {
          anytime: anytime || undefined,
          startTimeInMinutes:
            start ?? plan.startTimeInMinutes ?? DEFAULT_START_TIME_IN_MINUTES,
        }
      : {}),
    ...(set.title !== undefined ? { title: set.title ?? undefined } : {}),
    // A plain note replaces any formatted one.
    ...(set.note !== undefined
      ? { note: set.note ?? undefined, noteDoc: undefined }
      : {}),
    ...(set.date !== undefined ||
    set.anytime !== undefined ||
    set.startMinutes !== undefined
      ? reminderFields(plan.id, day, start, !!plan.notifyMe, offset)
      : {}),
  }
  useServiceReport.getState().updateDayPlan(changes)
  const updated = findPlan(plan.id)
  return {
    status: 'applied',
    undo: {
      kind: 'plan.update',
      planId: plan.id,
      before,
      afterUpdatedAt: updated?.updatedAt ?? null,
      ...(updated ? { after: snapshotOf(updated) } : {}),
    },
  }
}

/**
 * Whether the User changed the Plan since `after`: what the Plan form edits.
 * Not `updatedAt`, which bookkeeping (a buddy leaving, sync) bumps too.
 */
const editedSince = (plan: DayPlan, after: PlanSnapshot): boolean => {
  const now = snapshotOf(plan)
  return (
    now.date !== after.date ||
    now.minutes !== after.minutes ||
    now.startTimeInMinutes !== after.startTimeInMinutes ||
    now.anytime !== after.anytime ||
    now.title !== after.title ||
    now.note !== after.note ||
    JSON.stringify(now.noteDoc) !== JSON.stringify(after.noteDoc) ||
    now.notifyMe !== after.notifyMe
  )
}

/**
 * Restores the Plan only if the User hasn't changed it since (records from
 * before `after` compare `updatedAt`).
 */
export function undoPlanUpdate(
  planId: string,
  before: PlanSnapshot,
  afterUpdatedAt: number | null,
  after?: PlanSnapshot
): UndoOutcome {
  const plan = findPlan(planId)
  if (!plan) return 'gone'
  if (
    after
      ? editedSince(plan, after)
      : (plan.updatedAt ?? null) !== afterUpdatedAt
  )
    return 'kept'
  useServiceReport
    .getState()
    .updateDayPlan({ id: planId, ...fromSnapshot(before) })
  return 'undone'
}
