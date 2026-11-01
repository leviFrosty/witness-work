import moment from 'moment'
import { Visit } from '@/types/visit'
import { localizeDisplayDate } from '@/lib/dates'
import { followUpAnswer } from '@/lib/conversations'

export type VisitOutcome = 'study' | 'conversation' | 'notAtHome'

export const visitOutcome = (
  visit: Pick<Visit, 'notAtHome' | 'isBibleStudy'>
): VisitOutcome =>
  visit.notAtHome ? 'notAtHome' : visit.isBibleStudy ? 'study' : 'conversation'

export type FollowUpState = 'upcoming' | 'kept' | 'missed' | 'dismissed'

const ms = (date: Date | string) => new Date(date).getTime()

export const sortVisitsNewestFirst = (visits: Visit[]): Visit[] =>
  [...visits].sort(
    (a, b) => ms(b.date) - ms(a.date) || a.id.localeCompare(b.id)
  )

export const followUpState = (
  visit: Visit,
  contactVisits: Visit[],
  now: Date = new Date()
): FollowUpState | null => {
  const followUp = visit.followUp
  if (!followUp) return null
  if (followUp.dismissed) return 'dismissed'
  if (followUpAnswer(visit, contactVisits)) return 'kept'
  return ms(followUp.date) > now.getTime() ? 'upcoming' : 'missed'
}

export type UpNext = {
  visit: Visit
  date: Date
  notifyMe: boolean
  topic?: string
}

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
    if (followUpAnswer(visit, contactVisits)) continue
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

export const JOURNEY_WINDOW_MONTHS = 6

export const JOURNEY_PAST_SHARE = 0.8

export type Journey = {
  visitCount: number

  outcomeCounts: Record<VisitOutcome, number>

  first: Date

  windowStart: Date

  olderCount: number

  todayPosition: number

  dots: JourneyDot[]
}

export const getJourney = (
  contactVisits: Visit[],
  now: Date = new Date(),
  nextFollowUp?: Date
): Journey | null => {
  if (contactVisits.length === 0) return null
  const sorted = [...contactVisits].sort((a, b) => ms(a.date) - ms(b.date))
  const nowMs = now.getTime()
  const startMs = Math.max(
    moment(now).subtract(JOURNEY_WINDOW_MONTHS, 'months').valueOf(),
    Math.min(ms(sorted[0].date), nowMs)
  )
  const pastSpan = nowMs - startMs
  const hasFuture = !!nextFollowUp && nextFollowUp.getTime() > nowMs
  const todayPosition = hasFuture ? JOURNEY_PAST_SHARE : 1
  const futureSpan = hasFuture ? nextFollowUp!.getTime() - nowMs : 0

  const position = (t: number) => {
    if (t <= nowMs)
      return pastSpan === 0
        ? todayPosition
        : (todayPosition * (t - startMs)) / pastSpan
    if (!hasFuture) return 1
    return Math.min(
      1,
      todayPosition + ((1 - todayPosition) * (t - nowMs)) / futureSpan
    )
  }

  const inWindow = sorted.filter((v) => ms(v.date) >= startMs)
  const outcomeCounts = { study: 0, conversation: 0, notAtHome: 0 }
  for (const v of sorted) outcomeCounts[visitOutcome(v)]++
  return {
    visitCount: sorted.length,
    outcomeCounts,
    first: new Date(sorted[0].date),
    windowStart: new Date(startMs),
    olderCount: sorted.length - inWindow.length,
    todayPosition,
    dots: inWindow.map((v) => ({
      id: v.id,
      outcome: visitOutcome(v),
      position: position(ms(v.date)),
    })),
  }
}

export const gapBetween = (newer: Date, older: Date): string | null =>
  moment(newer).isSame(older, 'day')
    ? null
    : localizeDisplayDate(
        moment
          .duration(
            moment(newer).startOf('day').diff(moment(older).startOf('day'))
          )
          .humanize()
      )
