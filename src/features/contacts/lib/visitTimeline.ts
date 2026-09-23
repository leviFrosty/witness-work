import moment from 'moment'
import { Visit } from '@/types/visit'

/**
 * Pure derivations behind the Contact Details timeline. A Visit's outcome and
 * its follow-up's state are never stored — both are derived here from the two
 * outcome booleans, the follow-up date, `dismissed`, and the rest of the
 * contact's history.
 */

export type VisitOutcome = 'study' | 'conversation' | 'notAtHome'

/** Not at Home wins: a visit where no one answered can't have held a study. */
export const visitOutcome = (
  visit: Pick<Visit, 'notAtHome' | 'isBibleStudy'>
): VisitOutcome =>
  visit.notAtHome ? 'notAtHome' : visit.isBibleStudy ? 'study' : 'conversation'

/**
 * - `upcoming` — still in the future and not dismissed.
 * - `kept` — a later visit to the same contact fulfilled it.
 * - `missed` — its date passed with no later visit, and it wasn't dismissed.
 * - `dismissed` — the user dismissed it (data preserved).
 */
export type FollowUpState = 'upcoming' | 'kept' | 'missed' | 'dismissed'

const ms = (date: Date | string) => new Date(date).getTime()

/** Newest first; ties keep a stable order by id so rows never swap. */
export const sortVisitsNewestFirst = (visits: Visit[]): Visit[] =>
  [...visits].sort(
    (a, b) => ms(b.date) - ms(a.date) || a.id.localeCompare(b.id)
  )

/**
 * Mirrors the supersede rule used by Missed Conversations: any other visit on
 * or after the follow-up's date counts as having followed up.
 */
export const followUpState = (
  visit: Visit,
  contactVisits: Visit[],
  now: Date = new Date()
): FollowUpState | null => {
  const followUp = visit.followUp
  if (!followUp) return null
  if (followUp.dismissed) return 'dismissed'
  const due = ms(followUp.date)
  if (due > now.getTime()) return 'upcoming'
  const fulfilled = contactVisits.some(
    (other) => other.id !== visit.id && ms(other.date) >= due
  )
  return fulfilled ? 'kept' : 'missed'
}

export type UpNext = {
  visit: Visit
  date: Date
  notifyMe: boolean
  topic?: string
}

/** The soonest upcoming, non-dismissed follow-up — promoted to the Up Next card. */
export const getUpNext = (
  contactVisits: Visit[],
  now: Date = new Date()
): UpNext | null => {
  let best: UpNext | null = null
  for (const visit of contactVisits) {
    const followUp = visit.followUp
    if (!followUp || followUp.dismissed) continue
    const date = new Date(followUp.date)
    if (date.getTime() <= now.getTime()) continue
    if (!best || date.getTime() < best.date.getTime()) {
      best = {
        visit,
        date,
        notifyMe: followUp.notifyMe,
        topic: followUp.topic?.trim() || undefined,
      }
    }
  }
  return best
}

export type JourneyDot = { id: string; outcome: VisitOutcome; position: number }

/** How far back the journey rail looks; older visits only count in the totals. */
export const JOURNEY_WINDOW_MONTHS = 6
/** Share of the rail given to the past when an upcoming follow-up follows it. */
export const JOURNEY_PAST_SHARE = 0.8

export type Journey = {
  visitCount: number
  studyCount: number
  /** The very first visit, for the "since" caption. */
  first: Date
  /** Start of the rail window (`now` minus the window). */
  windowStart: Date
  /** Visits before the window; they only count toward the totals. */
  olderCount: number
  /** Where "today" sits on the 0–1 axis. */
  todayPosition: number
  /** Visits inside the window, placed on the 0–1 axis. */
  dots: JourneyDot[]
}

/**
 * A recent-activity rail: the last six months up to today, then (when there is
 * one) a short future segment ending at the next follow-up. Totals still cover
 * the whole history.
 */
export const getJourney = (
  contactVisits: Visit[],
  now: Date = new Date(),
  nextFollowUp?: Date
): Journey | null => {
  if (contactVisits.length === 0) return null
  const sorted = [...contactVisits].sort((a, b) => ms(a.date) - ms(b.date))
  const nowMs = now.getTime()
  const windowStart = moment(now).subtract(JOURNEY_WINDOW_MONTHS, 'months')
  const startMs = windowStart.valueOf()
  const hasFuture = !!nextFollowUp && nextFollowUp.getTime() > nowMs
  const todayPosition = hasFuture ? JOURNEY_PAST_SHARE : 1
  const futureSpan = hasFuture ? nextFollowUp!.getTime() - nowMs : 0

  const position = (t: number) => {
    if (t <= nowMs) return (todayPosition * (t - startMs)) / (nowMs - startMs)
    if (!hasFuture) return 1
    return Math.min(
      1,
      todayPosition + ((1 - todayPosition) * (t - nowMs)) / futureSpan
    )
  }

  const inWindow = sorted.filter((v) => ms(v.date) >= startMs)
  return {
    visitCount: sorted.length,
    studyCount: sorted.filter((v) => visitOutcome(v) === 'study').length,
    first: new Date(sorted[0].date),
    windowStart: windowStart.toDate(),
    olderCount: sorted.length - inWindow.length,
    todayPosition,
    dots: inWindow.map((v) => ({
      id: v.id,
      outcome: visitOutcome(v),
      position: position(ms(v.date)),
    })),
  }
}

/**
 * Elapsed time between two visits for the rail's gap pill. `null` when both
 * fall on the same calendar day (the pill then reads "Same day").
 */
export const gapBetween = (newer: Date, older: Date): string | null =>
  moment(newer).isSame(older, 'day')
    ? null
    : moment
        .duration(
          moment(newer).startOf('day').diff(moment(older).startOf('day'))
        )
        .humanize()

/** A note that holds only whitespace is treated as no note at all. */
export const visibleNote = (note?: string): string | null =>
  note && note.trim().length > 0 ? note.trim() : null
