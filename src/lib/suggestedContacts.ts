import type { Contact, Coordinate } from '@/types/contact'
import type { Visit } from '@/types/visit'
import type { ConversationIndex } from '@/lib/conversationIndex'
import i18n, { type TranslationKey } from '@/lib/locales'
import { distanceMeters } from '@/lib/geo'
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

export type SuggestedSectionKey = 'nearby' | 'followUpsDue' | 'recent'

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
}

/**
 * Splits Contacts into the Suggested sections: Nearby (within
 * {@link NEARBY_RADIUS_METERS} of `here`, closest first), then Follow-ups due
 * (most overdue first), then Recent (most recent Visit first). Each section is
 * capped at {@link SUGGESTED_SECTION_LIMIT} and skips Contacts already shown in
 * an earlier one. Without `here`, there's no Nearby section.
 *
 * Shared by the Log Visit contact picker and the Contacts list's Suggested sort
 * so both suggest the same people.
 */
export const buildSuggestedContacts = ({
  contacts,
  conversations,
  index,
  here,
  currentTime = new Date(),
}: {
  contacts: Contact[]
  conversations: Visit[]
  index: ConversationIndex
  here?: Coordinate | null
  currentTime?: Date
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

  return { sections, suggestedIds, distanceById, dueFollowUpById }
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
 * due); Follow-ups Due shows how overdue. Recent keeps the row's default line.
 */
export const suggestedRowDetail = (
  section: SuggestedSectionKey,
  contact: Contact,
  suggested: Pick<SuggestedContacts, 'dueFollowUpById'>,
  currentTime: Date = new Date()
): SuggestedRowDetail | undefined => {
  const due = suggested.dueFollowUpById.get(contact.id)
  if (section === 'followUpsDue' && due) {
    return { text: dueFollowUpLabel(due, currentTime), tone: 'due' }
  }
  if (section !== 'nearby') return undefined
  const parts = [
    due ? dueFollowUpLabel(due, currentTime) : '',
    contact.address?.line1?.trim() ?? '',
  ].filter(Boolean)
  if (parts.length === 0) return undefined
  return { text: parts.join(' · '), tone: due ? 'due' : 'default' }
}
