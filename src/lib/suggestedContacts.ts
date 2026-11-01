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

export const NEARBY_RADIUS_METERS = 250

export const RECENT_VISIT_DAYS = 14

export const DUE_FOLLOW_UP_LOOKBACK_DAYS = 30

export const SUGGESTED_SECTION_LIMIT = 5

export const BEEN_A_WHILE_MIN_DAYS = 21

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
  sections: SuggestedSection[]

  suggestedIds: Set<string>

  distanceById: Map<string, number>

  dueFollowUpById: Map<string, Visit>

  lastTalkById: Map<string, Visit>
}

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

  beenAWhile?: boolean

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

const calendarDaysBetween = (from: Date, to: Date) => {
  const startOfDay = (d: Date) => {
    const copy = new Date(d)
    copy.setHours(0, 0, 0, 0)
    return copy.getTime()
  }
  return Math.round((startOfDay(to) - startOfDay(from)) / 86_400_000)
}

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

export const suggestedSectionTitleKey: Record<
  SuggestedSectionKey,
  TranslationKey
> = {
  nearby: 'suggested_nearby',
  followUpsDue: 'suggested_followUpsDue',
  recent: 'suggested_recent',
  beenAWhile: 'suggested_beenAWhile',
}

export const followUpDayLabel = (
  due: Date | number,
  currentTime: Date = new Date()
): string => {
  const startOfDay = (d: Date | number) => {
    const copy = new Date(d)
    copy.setHours(0, 0, 0, 0)
    return copy.getTime()
  }
  const daysAway = Math.round(
    (startOfDay(due) - startOfDay(currentTime)) / 86_400_000
  )
  if (daysAway < 0) {
    return i18n.t('suggested_followUpOverdue' as TranslationKey, {
      count: -daysAway,
    })
  }
  if (daysAway === 0) return i18n.t('suggested_followUpToday')
  if (daysAway === 1) return i18n.t('contacts_sortDetail_followUpTomorrow')
  return i18n.t('contacts_sortDetail_followUpInDays' as TranslationKey, {
    count: daysAway,
  })
}

export const dueFollowUpLabel = (
  visit: Visit,
  currentTime: Date = new Date()
): string => followUpDayLabel(new Date(visit.followUp!.date), currentTime)

export type SuggestedRowDetail = { text: string; tone?: 'default' | 'due' }

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
