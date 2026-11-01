import { Visit } from '@/types/visit'
import { StalenessBreakpoints } from '@/types/staleness'
import { normalizeStalenessBreakpoints } from '@/constants/staleness'
import { ContactStaleness } from '@/lib/contactStaleness'
import {
  isAppointment,
  isOwnVisit,
  MISSED_FOLLOW_UP_AFTER_HOURS,
  MISSED_FOLLOW_UP_LOOKBACK_DAYS,
} from '@/lib/conversations'

export const stalenessRank: Record<ContactStaleness, number> = {
  never: 0,
  recent: 1,
  week: 2,
  month: 3,
}

export type ConversationIndex = {
  mostRecentConvMs: Map<string, number>

  mostRecentConvByContact: Map<string, Visit>

  mostRecentStudyMs: Map<string, number>

  studyContactIds: Set<string>

  studiedThisMonthIds: Set<string>

  nextFollowUpMs: Map<string, number>

  missedFollowUpMs: Map<string, number>

  followUpsChangeAtMs: number | null

  nowMs: number

  stalenessFor: (contactId: string) => ContactStaleness

  stalenessRankFor: (contactId: string) => number
}

export function buildConversationIndex(
  conversations: Visit[],
  breakpoints: StalenessBreakpoints,
  today?: string,
  nowMs: number = Date.now()
): ConversationIndex {
  const mostRecentConvMs = new Map<string, number>()
  const mostRecentConvByContact = new Map<string, Visit>()
  const mostRecentStudyMs = new Map<string, number>()
  const studyContactIds = new Set<string>()
  const studiedThisMonthIds = new Set<string>()

  const now = new Date(nowMs)
  const [year, month] = today
    ? today.split('-').map(Number)
    : [now.getFullYear(), now.getMonth() + 1]

  const startOfMonth = new Date(year, month - 1, 1).getTime()
  const startOfNextMonth = new Date(year, month, 1).getTime()

  const appointments: { contactId: string; visitMs: number; dueMs: number }[] =
    []

  for (const c of conversations) {
    const id = c.contact.id
    const ms = new Date(c.date).getTime()
    if (Number.isNaN(ms)) continue

    if (isAppointment(c)) {
      const dueMs = new Date(c.followUp!.date).getTime()
      if (!Number.isNaN(dueMs))
        appointments.push({ contactId: id, visitMs: ms, dueMs })
    }

    const prevConv = mostRecentConvMs.get(id)
    if (prevConv === undefined || ms > prevConv) {
      mostRecentConvMs.set(id, ms)
      mostRecentConvByContact.set(id, c)
    }

    if (c.isBibleStudy) {
      studyContactIds.add(id)
      const prevStudy = mostRecentStudyMs.get(id)
      if (prevStudy === undefined || ms > prevStudy) {
        mostRecentStudyMs.set(id, ms)
      }
      if (ms >= startOfMonth && ms < startOfNextMonth && isOwnVisit(c)) {
        studiedThisMonthIds.add(id)
      }
    }
  }

  const HOUR_MS = 60 * 60 * 1000
  const missedBeforeMs = now.getTime() - MISSED_FOLLOW_UP_AFTER_HOURS * HOUR_MS
  const lookbackStart = new Date(now)
  lookbackStart.setHours(0, 0, 0, 0)
  lookbackStart.setDate(
    lookbackStart.getDate() - MISSED_FOLLOW_UP_LOOKBACK_DAYS
  )
  const missedFromMs = lookbackStart.getTime()
  const nextFollowUpMs = new Map<string, number>()
  const missedFollowUpMs = new Map<string, number>()
  let soonestOpenDueMs: number | null = null
  for (const { contactId, visitMs, dueMs } of appointments) {
    const latest = mostRecentConvMs.get(contactId)!
    const dueDay = new Date(dueMs)
    dueDay.setHours(0, 0, 0, 0)
    if (latest > visitMs && latest >= dueDay.getTime()) continue
    if (dueMs > missedBeforeMs) {
      const prev = nextFollowUpMs.get(contactId)
      if (prev === undefined || dueMs < prev)
        nextFollowUpMs.set(contactId, dueMs)
      if (soonestOpenDueMs === null || dueMs < soonestOpenDueMs)
        soonestOpenDueMs = dueMs
    } else if (dueMs >= missedFromMs) {
      const prev = missedFollowUpMs.get(contactId)
      if (prev === undefined || dueMs < prev)
        missedFollowUpMs.set(contactId, dueMs)
    }
  }

  const { weekDays, monthDays } = normalizeStalenessBreakpoints(breakpoints)
  const DAY_MS = 24 * 60 * 60 * 1000
  const monthAgoMs = now.getTime() - monthDays * DAY_MS
  const weekAgoMs = now.getTime() - weekDays * DAY_MS

  const stalenessFor = (contactId: string): ContactStaleness => {
    const ms = mostRecentConvMs.get(contactId)
    if (ms === undefined) return 'never'
    if (ms < monthAgoMs) return 'month'
    if (ms < weekAgoMs) return 'week'
    return 'recent'
  }

  const stalenessRankFor = (contactId: string): number =>
    stalenessRank[stalenessFor(contactId)]

  return {
    mostRecentConvMs,
    mostRecentConvByContact,
    mostRecentStudyMs,
    studyContactIds,
    studiedThisMonthIds,
    nextFollowUpMs,
    missedFollowUpMs,
    followUpsChangeAtMs:
      soonestOpenDueMs === null
        ? null
        : soonestOpenDueMs + MISSED_FOLLOW_UP_AFTER_HOURS * HOUR_MS,
    nowMs,
    stalenessFor,
    stalenessRankFor,
  }
}
