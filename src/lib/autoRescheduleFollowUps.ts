import moment from 'moment'
import {
  followUpAnswer,
  isAppointment,
  MISSED_FOLLOW_UP_AFTER_HOURS,
  MISSED_FOLLOW_UP_LOOKBACK_DAYS,
  visitsByContact,
} from '@/lib/conversations'
import {
  offsetToMinutes,
  reminderFireDate,
  type NotificationOffset,
} from '@/lib/notificationOffset'
import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'

export type AutoRescheduleGrace = '4hours' | 'nextMorning' | '24hours'

export const AUTO_RESCHEDULE_GRACE_OPTIONS = [
  '4hours',
  'nextMorning',
  '24hours',
] as const

export const AUTO_RESCHEDULE_UNITS = ['days', 'weeks'] as const
export type AutoRescheduleUnit = (typeof AUTO_RESCHEDULE_UNITS)[number]

export type AutoRescheduleOffset = {
  amount?: number
  unit?: moment.unitOfTime.DurationConstructor
}

export const DEFAULT_AUTO_RESCHEDULE_OFFSET: Required<AutoRescheduleOffset> = {
  amount: 1,
  unit: 'weeks',
}

export const DEFAULT_AUTO_RESCHEDULE_GRACE: AutoRescheduleGrace = 'nextMorning'

export const DEFAULT_AUTO_RESCHEDULE_MAX_COUNT = 2

export const AUTO_RESCHEDULE_MAX_COUNT_OPTIONS: readonly (number | null)[] = [
  1,
  2,
  3,
  5,
  null,
]

export const AUTO_RESCHEDULE_TRAY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

const HOUR_MS = 60 * 60 * 1000
const NEXT_MORNING_HOUR = 6
const MAX_ADVANCE_STEPS = 500

export type AutoRescheduleSettings = {
  enabled: boolean
  offset?: AutoRescheduleOffset | null
  grace?: AutoRescheduleGrace | null
  maxCount?: number | null
  enabledAt?: number | null
}

export type AutoReschedulePlan = {
  visit: Visit
  updatedVisit: Visit
  previousDate: Date
  nextDate: Date
  count: number
}

export function resolveAutoRescheduleOffset(
  offset?: AutoRescheduleOffset | null
): Required<AutoRescheduleOffset> {
  const amount =
    typeof offset?.amount === 'number' &&
    Number.isFinite(offset.amount) &&
    offset.amount >= 1
      ? Math.floor(offset.amount)
      : DEFAULT_AUTO_RESCHEDULE_OFFSET.amount
  const unit = offset?.unit ?? DEFAULT_AUTO_RESCHEDULE_OFFSET.unit
  return { amount, unit }
}

export function resolveAutoRescheduleGrace(
  grace?: AutoRescheduleGrace | null
): AutoRescheduleGrace {
  if (grace === '4hours' || grace === 'nextMorning' || grace === '24hours')
    return grace
  return DEFAULT_AUTO_RESCHEDULE_GRACE
}

export function autoRescheduleEligibleAt(
  followUpDate: Date,
  grace: AutoRescheduleGrace
): number {
  const scheduledMs = new Date(followUpDate).getTime()
  const minAfterMissed = scheduledMs + MISSED_FOLLOW_UP_AFTER_HOURS * HOUR_MS
  switch (grace) {
    case '4hours':
      return minAfterMissed
    case '24hours':
      return moment(scheduledMs).add(24, 'hours').valueOf()
    case 'nextMorning': {
      const nextMorning = moment(scheduledMs)
        .add(1, 'day')
        .hour(NEXT_MORNING_HOUR)
        .minute(0)
        .second(0)
        .millisecond(0)
        .valueOf()
      return Math.max(nextMorning, minAfterMissed)
    }
  }
}

export function nextAutoRescheduleDate(
  fromDate: Date,
  offset: Required<AutoRescheduleOffset>,
  now: Date
): Date {
  const base = moment(fromDate)
  const targetMs = now.getTime()
  const amount = Math.max(1, Math.floor(offset.amount))
  const unit = offset.unit

  for (let steps = 1; steps <= MAX_ADVANCE_STEPS; steps++) {
    const candidate = base.clone().add(steps * amount, unit)
    if (candidate.valueOf() > targetMs) {
      return candidate.toDate()
    }
  }
  return moment(now).add(amount, unit).toDate()
}

export function hasFollowUpBuddies(
  followUp: Visit['followUp'] | undefined
): boolean {
  return (followUp?.buddies?.length ?? 0) > 0
}

export function isFollowUpAutoRescheduleEnabled(
  visit: Visit,
  globalEnabled: boolean
): boolean {
  if (!globalEnabled) return false
  const followUp = visit.followUp
  if (!followUp || followUp.dismissed) return false
  if (followUp.autoReschedule === false) return false
  if (hasFollowUpBuddies(followUp)) return false
  return true
}

export function isAutoReschedulePaused(
  visit: Visit,
  maxCount: number | null | undefined
): boolean {
  if (maxCount === null) return false
  const cap =
    typeof maxCount === 'number' && Number.isFinite(maxCount) && maxCount > 0
      ? maxCount
      : DEFAULT_AUTO_RESCHEDULE_MAX_COUNT
  return (visit.followUp?.autoRescheduleCount ?? 0) >= cap
}

export function clearAutoRescheduleMetadata(
  followUp: NonNullable<Visit['followUp']>
): NonNullable<Visit['followUp']> {
  const {
    autoRescheduledFrom: _from,
    autoRescheduledAt: _at,
    autoRescheduleCount: _count,
    autoRescheduleSkippedAt: _skipped,
    ...rest
  } = followUp
  return rest
}

function followUpReminderOffsetMinutes(
  followUp: NonNullable<Visit['followUp']>,
  defaultOffset: NotificationOffset
): number | null {
  if (!followUp.notifyMe) return null
  if (
    typeof followUp.reminderOffsetMinutes === 'number' &&
    Number.isFinite(followUp.reminderOffsetMinutes) &&
    followUp.reminderOffsetMinutes >= 0
  ) {
    return followUp.reminderOffsetMinutes
  }
  const existing = followUp.notifications?.[0]?.date
  if (existing) {
    const diff = Math.round(
      (new Date(followUp.date).getTime() - new Date(existing).getTime()) /
        60_000
    )
    if (Number.isFinite(diff) && diff >= 0) return diff
  }
  return offsetToMinutes(defaultOffset)
}

function updatedFollowUpNotifications(
  visitId: string,
  newDate: Date,
  offsetMinutes: number | null
) {
  if (offsetMinutes === null) return []
  return [
    {
      id: `witness-work-visit-${visitId}`,
      date: reminderFireDate(newDate, offsetMinutes),
    },
  ]
}

export function computeAutoReschedules({
  conversations,
  contacts,
  settings,
  defaultNotificationOffset,
  now,
}: {
  conversations: Visit[]
  contacts: Contact[]
  settings: AutoRescheduleSettings
  defaultNotificationOffset: NotificationOffset
  now: Date
}): AutoReschedulePlan[] {
  if (!settings.enabled) return []

  const nowMs = now.getTime()
  const lookbackStart = moment(now)
    .subtract(MISSED_FOLLOW_UP_LOOKBACK_DAYS, 'days')
    .startOf('day')
    .valueOf()
  const offset = resolveAutoRescheduleOffset(settings.offset)
  const grace = resolveAutoRescheduleGrace(settings.grace)
  const maxCount =
    settings.maxCount === undefined
      ? DEFAULT_AUTO_RESCHEDULE_MAX_COUNT
      : settings.maxCount

  const activeContactIds = new Set<string>()
  for (const contact of contacts) {
    if (
      contact.dismissedUntil &&
      new Date(contact.dismissedUntil).getTime() > nowMs
    ) {
      continue
    }
    activeContactIds.add(contact.id)
  }

  const candidates = conversations.filter((visit) => {
    if (!isAppointment(visit) || !visit.followUp) return false
    if (!activeContactIds.has(visit.contact.id)) return false
    if (!isFollowUpAutoRescheduleEnabled(visit, true)) return false
    const scheduledMs = new Date(visit.followUp.date).getTime()
    if (!Number.isFinite(scheduledMs)) return false
    if (scheduledMs < lookbackStart || scheduledMs >= nowMs) return false
    const eligibleAt = autoRescheduleEligibleAt(visit.followUp.date, grace)
    if (nowMs < eligibleAt) return false
    if (
      typeof settings.enabledAt === 'number' &&
      Number.isFinite(settings.enabledAt) &&
      eligibleAt < settings.enabledAt
    ) {
      return false
    }
    if (visit.followUp.autoRescheduleSkippedAt === scheduledMs) return false
    if (isAutoReschedulePaused(visit, maxCount)) return false
    return true
  })

  if (candidates.length === 0) return []

  const byContact = visitsByContact(
    conversations,
    new Set(candidates.map((visit) => visit.contact.id))
  )

  const plans: AutoReschedulePlan[] = []
  for (const visit of candidates) {
    const contactVisits = byContact.get(visit.contact.id) ?? []
    if (followUpAnswer(visit, contactVisits)) continue

    const followUp = visit.followUp!
    const previousDate = new Date(followUp.date)
    const nextDate = nextAutoRescheduleDate(previousDate, offset, now)
    const count = (followUp.autoRescheduleCount ?? 0) + 1
    const offsetMinutes = followUpReminderOffsetMinutes(
      followUp,
      defaultNotificationOffset
    )

    const updatedVisit: Visit = {
      ...visit,
      followUp: {
        ...followUp,
        date: nextDate,
        reminderOffsetMinutes: offsetMinutes ?? undefined,
        notifications: updatedFollowUpNotifications(
          visit.id,
          nextDate,
          offsetMinutes
        ),
        autoRescheduledFrom: previousDate,
        autoRescheduledAt: nowMs,
        autoRescheduleCount: count,
        autoRescheduleSkippedAt: undefined,
      },
    }

    plans.push({
      visit,
      updatedVisit,
      previousDate,
      nextDate,
      count,
    })
  }

  return plans
}

export function undoAutoReschedule(
  visit: Visit,
  defaultNotificationOffset: NotificationOffset
): Visit | null {
  const followUp = visit.followUp
  if (!followUp?.autoRescheduledFrom) return null

  const previousDate = new Date(followUp.autoRescheduledFrom)
  if (!Number.isFinite(previousDate.getTime())) return null

  const offsetMinutes = followUpReminderOffsetMinutes(
    followUp,
    defaultNotificationOffset
  )
  const previousCount = Math.max(0, (followUp.autoRescheduleCount ?? 1) - 1)

  const {
    autoRescheduledFrom: _from,
    autoRescheduledAt: _at,
    autoRescheduleCount: _count,
    ...rest
  } = followUp

  return {
    ...visit,
    followUp: {
      ...rest,
      date: previousDate,
      reminderOffsetMinutes: offsetMinutes ?? undefined,
      notifications: updatedFollowUpNotifications(
        visit.id,
        previousDate,
        offsetMinutes
      ),
      ...(previousCount > 0 ? { autoRescheduleCount: previousCount } : {}),
      autoRescheduleSkippedAt: previousDate.getTime(),
    },
  }
}

export function contingentNextFollowUpDate({
  visit,
  contactVisits,
  settings,
  now,
}: {
  visit: Visit
  contactVisits: Visit[]
  settings: AutoRescheduleSettings
  now: Date
}): Date | null {
  if (!isFollowUpAutoRescheduleEnabled(visit, settings.enabled)) return null
  const followUp = visit.followUp
  if (!followUp?.notifyMe) return null
  if (followUpAnswer(visit, contactVisits)) return null
  const maxCount =
    settings.maxCount === undefined
      ? DEFAULT_AUTO_RESCHEDULE_MAX_COUNT
      : settings.maxCount
  if (isAutoReschedulePaused(visit, maxCount)) return null

  const scheduled = new Date(followUp.date)
  if (!Number.isFinite(scheduled.getTime())) return null
  if (followUp.autoRescheduleSkippedAt === scheduled.getTime()) return null

  const offset = resolveAutoRescheduleOffset(settings.offset)
  const after = scheduled.getTime() > now.getTime() ? scheduled : now
  return nextAutoRescheduleDate(scheduled, offset, after)
}
