import type { Contact, Coordinate } from '@/types/contact'
import type { Visit } from '@/types/visit'
import type { ConversationIndex } from '@/lib/conversationIndex'
import i18n, { type TranslationKey } from '@/lib/locales'
import { distanceMeters } from '@/lib/geo'
import { formatRelative } from '@/lib/dates'
import { DATA_PROTECTION_RETENTION_DAYS } from '@/lib/dataProtection'
import { isContactDismissed } from '@/lib/dismissedContacts'
import {
  followUpAnswer,
  isAppointment,
  visitsByContact,
} from '@/lib/conversations'

/**
 * Contacts this close to the device count as Nearby. Geocoded addresses can be
 * a house or two off, so a radius reads better than a strict nearest-first
 * order, and it keeps a whole apartment building together.
 */
export const NEARBY_RADIUS_METERS = 250
/** A Visit this many days old or newer puts a Contact in Recent. */
export const RECENT_VISIT_DAYS = 14
/** Missed Follow-ups older than this stop counting as due (same as Home). */
export const DUE_FOLLOW_UP_LOOKBACK_DAYS = 30
/** Each suggested section shows at most this many Contacts. */
export const SUGGESTED_SECTION_LIMIT = 5
/**
 * Been a While: the last conversation is at least this many calendar days old,
 * and no Visit of any kind (a Not at Home included) is newer.
 */
export const BEEN_A_WHILE_MIN_DAYS = 21
/** Been a While stops at this many days; older Contacts have moved on. */
export const BEEN_A_WHILE_MAX_DAYS = 120

export type SuggestedSectionKey =
  | 'nearby'
  | 'followUpsDue'
  | 'recent'
  | 'beenAWhile'

export type SuggestedSection = {
  key: SuggestedSectionKey
  contacts: Contact[]
}

export type SuggestedContacts = {
  /** Non-empty sections, in display order. A Contact appears in one at most. */
  sections: SuggestedSection[]
  /** Ids of every Contact placed in a section. */
  suggestedIds: Set<string>
  /** Meters from `here`, for Contacts with a coordinate (only when `here`). */
  distanceById: Map<string, number>
  /**
   * The oldest open Follow-up per Contact that is due: today (any time) or
   * missed within the lookback. Present even when the Contact landed in an
   * earlier section, so rows can still say "Follow-up today".
   */
  dueFollowUpById: Map<string, Visit>
  /**
   * The last real conversation (not a Not at Home) per Contact in Been a While,
   * for the row's "Talked 2 months ago" line.
   */
  lastTalkById: Map<string, Visit>
}

/**
 * Splits Contacts into the Suggested sections: Nearby (within
 * {@link NEARBY_RADIUS_METERS} of `here`, closest first), then Follow-ups due
 * (most overdue first), then Recent (most recent Visit first), then, when
 * `beenAWhile` is on, Been a While (see `beenAWhileContacts`). Each section is
 * capped at {@link SUGGESTED_SECTION_LIMIT} and skips Contacts already shown in
 * an earlier one. Without `here`, there's no Nearby section.
 *
 * Shared by the Log Visit contact picker and the Contacts list's Suggested sort
 * so both suggest the same people. Only the Contacts list asks for Been a
 * While; the picker is for someone just visited.
 */
export const buildSuggestedContacts = ({
  contacts,
  conversations,
  index,
  here,
  currentTime = new Date(),
  beenAWhile = false,
  dataProtectionMode = false,
}: {
  contacts: Contact[]
  conversations: Visit[]
  index: ConversationIndex
  here?: Coordinate | null
  currentTime?: Date
  /** Adds the Been a While section. */
  beenAWhile?: boolean
  /** Ends Been a While at the retention prompt's cutoff. */
  dataProtectionMode?: boolean
}): SuggestedContacts => {
  const suggestedIds = new Set<string>()
  const sections: SuggestedSection[] = []
  const take = (key: SuggestedSectionKey, ordered: Contact[]) => {
    const picked: Contact[] = []
    for (const contact of ordered) {
      if (picked.length >= SUGGESTED_SECTION_LIMIT) break
      if (suggestedIds.has(contact.id)) continue
      picked.push(contact)
      suggestedIds.add(contact.id)
    }
    if (picked.length > 0) sections.push({ key, contacts: picked })
  }

  const distanceById = new Map<string, number>()
  if (here) {
    for (const contact of contacts) {
      if (!contact.coordinate) continue
      distanceById.set(contact.id, distanceMeters(here, contact.coordinate))
    }
    take(
      'nearby',
      contacts
        .filter(
          (c) => (distanceById.get(c.id) ?? Infinity) <= NEARBY_RADIUS_METERS
        )
        .sort((a, b) => distanceById.get(a.id)! - distanceById.get(b.id)!)
    )
  }

  const dueFollowUpById = dueFollowUps(conversations, currentTime)
  const followUpMs = (c: Contact) =>
    new Date(dueFollowUpById.get(c.id)!.followUp!.date).getTime()
  take(
    'followUpsDue',
    contacts
      .filter((c) => dueFollowUpById.has(c.id))
      .sort((a, b) => followUpMs(a) - followUpMs(b))
  )

  const recentAfter = currentTime.getTime() - RECENT_VISIT_DAYS * 86_400_000
  const lastVisitMs = (c: Contact) => index.mostRecentConvMs.get(c.id) ?? 0
  take(
    'recent',
    contacts
      .filter((c) => lastVisitMs(c) >= recentAfter)
      .sort((a, b) => lastVisitMs(b) - lastVisitMs(a))
  )

  const lastTalkById = new Map<string, Visit>()
  if (beenAWhile) {
    const lapsed = beenAWhileContacts({
      contacts,
      conversations,
      index,
      currentTime,
      maxDays: dataProtectionMode
        ? Math.min(BEEN_A_WHILE_MAX_DAYS, DATA_PROTECTION_RETENTION_DAYS)
        : BEEN_A_WHILE_MAX_DAYS,
    })
    take(
      'beenAWhile',
      lapsed.map(({ contact }) => contact)
    )
    for (const { contact, lastTalk } of lapsed) {
      if (suggestedIds.has(contact.id)) lastTalkById.set(contact.id, lastTalk)
    }
  }

  return { sections, suggestedIds, distanceById, dueFollowUpById, lastTalkById }
}

/** Whole calendar days from `from` to `to`, so the window doesn't move by hour. */
const calendarDaysBetween = (from: Date, to: Date) => {
  const startOfDay = (d: Date) => {
    const copy = new Date(d)
    copy.setHours(0, 0, 0, 0)
    return copy.getTime()
  }
  return Math.round((startOfDay(to) - startOfDay(from)) / 86_400_000)
}

/**
 * People talked with a while ago who'd otherwise go quiet: the last real
 * conversation (a Not at Home doesn't count) was {@link BEEN_A_WHILE_MIN_DAYS}
 * to `maxDays` days ago, no Visit at all is newer than the minimum (a recent
 * Not at Home means the User is already trying), no open Follow-up is upcoming
 * or missed within {@link DUE_FOLLOW_UP_LOOKBACK_DAYS} days, and the Contact
 * isn't dismissed. Bible studies come first, then favorites, then the most
 * recently talked with.
 */
const beenAWhileContacts = ({
  contacts,
  conversations,
  index,
  currentTime,
  maxDays,
}: {
  contacts: Contact[]
  conversations: Visit[]
  index: ConversationIndex
  currentTime: Date
  maxDays: number
}) => {
  const lastTalkByContact = new Map<string, { visit: Visit; ms: number }>()
  for (const visit of conversations) {
    if (visit.notAtHome) continue
    const ms = new Date(visit.date).getTime()
    if (Number.isNaN(ms)) continue
    const prev = lastTalkByContact.get(visit.contact.id)
    if (!prev || ms > prev.ms)
      lastTalkByContact.set(visit.contact.id, { visit, ms })
  }

  const byContact = visitsByContact(conversations)
  // A Follow-up missed longer ago than Follow-ups Due looks back has lapsed
  // too, so it doesn't keep the Contact out.
  const lookbackStart = new Date(currentTime)
  lookbackStart.setHours(0, 0, 0, 0)
  lookbackStart.setDate(lookbackStart.getDate() - DUE_FOLLOW_UP_LOOKBACK_DAYS)
  const hasOpenFollowUp = (contactId: string) =>
    (byContact.get(contactId) ?? []).some(
      (visit) =>
        isAppointment(visit) &&
        new Date(visit.followUp!.date).getTime() >= lookbackStart.getTime() &&
        !followUpAnswer(visit, byContact.get(contactId) ?? [])
    )

  const daysSince = (ms: number) =>
    calendarDaysBetween(new Date(ms), currentTime)
  const lapsed: { contact: Contact; lastTalk: Visit; ms: number }[] = []
  for (const contact of contacts) {
    const talk = lastTalkByContact.get(contact.id)
    if (!talk || isContactDismissed(contact)) continue
    const talkDays = daysSince(talk.ms)
    if (talkDays < BEEN_A_WHILE_MIN_DAYS || talkDays > maxDays) continue
    const lastVisitMs = index.mostRecentConvMs.get(contact.id)
    if (
      lastVisitMs !== undefined &&
      daysSince(lastVisitMs) < BEEN_A_WHILE_MIN_DAYS
    )
      continue
    if (hasOpenFollowUp(contact.id)) continue
    lapsed.push({ contact, lastTalk: talk.visit, ms: talk.ms })
  }

  const rank = ({ contact, lastTalk }: (typeof lapsed)[number]) =>
    lastTalk.isBibleStudy ? 0 : contact.isFavorite ? 1 : 2
  return lapsed.sort((a, b) => rank(a) - rank(b) || b.ms - a.ms)
}

/**
 * Open Follow-ups dated today or missed within the lookback, oldest per
 * Contact. "Open" means no later Visit answered it (see `followUpAnswer`).
 */
const dueFollowUps = (conversations: Visit[], currentTime: Date) => {
  const endOfToday = new Date(currentTime)
  endOfToday.setHours(23, 59, 59, 999)
  const from = new Date(currentTime)
  from.setHours(0, 0, 0, 0)
  from.setDate(from.getDate() - DUE_FOLLOW_UP_LOOKBACK_DAYS)
  const max = endOfToday.getTime()
  const min = from.getTime()

  const byContact = visitsByContact(conversations)
  const due = new Map<string, Visit>()
  for (const visit of conversations) {
    if (!isAppointment(visit)) continue
    const ms = new Date(visit.followUp!.date).getTime()
    if (Number.isNaN(ms) || ms < min || ms > max) continue
    if (followUpAnswer(visit, byContact.get(visit.contact.id) ?? [])) continue
    const prev = due.get(visit.contact.id)
    if (!prev || ms < new Date(prev.followUp!.date).getTime()) {
      due.set(visit.contact.id, visit)
    }
  }
  return due
}

/** Section header string for each suggested section. */
export const suggestedSectionTitleKey: Record<
  SuggestedSectionKey,
  TranslationKey
> = {
  nearby: 'suggested_nearby',
  followUpsDue: 'suggested_followUpsDue',
  recent: 'suggested_recent',
  beenAWhile: 'suggested_beenAWhile',
}

/** "Follow-up today" or "Follow-up 2 days overdue" for a due Follow-up. */
export const dueFollowUpLabel = (
  visit: Visit,
  currentTime: Date = new Date()
): string => {
  const startOfDay = (d: Date) => {
    const copy = new Date(d)
    copy.setHours(0, 0, 0, 0)
    return copy.getTime()
  }
  const daysOverdue = Math.round(
    (startOfDay(currentTime) - startOfDay(new Date(visit.followUp!.date))) /
      86_400_000
  )
  return daysOverdue <= 0
    ? i18n.t('suggested_followUpToday')
    : i18n.t('suggested_followUpOverdue' as TranslationKey, {
        count: daysOverdue,
      })
}

/** A row's second line, saying why a suggested Contact is listed. */
export type SuggestedRowDetail = { text: string; tone?: 'default' | 'due' }

/**
 * Why a suggested Contact is listed: Nearby shows the street so neighbors in
 * one building are easy to tell apart (after "Follow-up today" when one is
 * due); Follow-ups Due shows how overdue; Been a While shows when they last
 * talked, which a later Not at Home would hide. Recent keeps the row's default
 * line.
 */
export const suggestedRowDetail = (
  section: SuggestedSectionKey,
  contact: Contact,
  suggested: Pick<SuggestedContacts, 'dueFollowUpById'> &
    Partial<Pick<SuggestedContacts, 'lastTalkById'>>,
  currentTime: Date = new Date()
): SuggestedRowDetail | undefined => {
  const due = suggested.dueFollowUpById.get(contact.id)
  if (section === 'followUpsDue' && due) {
    return { text: dueFollowUpLabel(due, currentTime), tone: 'due' }
  }
  const lastTalk = suggested.lastTalkById?.get(contact.id)
  if (section === 'beenAWhile' && lastTalk) {
    return {
      text: i18n.t('suggested_lastTalked', {
        when: formatRelative(lastTalk.date),
      }),
    }
  }
  if (section !== 'nearby') return undefined
  const parts = [
    due ? dueFollowUpLabel(due, currentTime) : '',
    contact.address?.line1?.trim() ?? '',
  ].filter(Boolean)
  if (parts.length === 0) return undefined
  return { text: parts.join(' · '), tone: due ? 'due' : 'default' }
}
