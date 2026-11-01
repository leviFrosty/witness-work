import moment from 'moment'
import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'
import { CustomFieldDefinition } from '@/types/customField'
import {
  contactHasAtLeastOneStudy,
  contactStudiedForGivenMonth,
  followUpAnswer,
  isAppointment,
  MISSED_FOLLOW_UP_AFTER_HOURS,
  MISSED_FOLLOW_UP_LOOKBACK_DAYS,
  overdueFollowUpConversations,
} from '@/lib/conversations'
import { ContactStaleness, getContactStaleness } from '@/lib/contactStaleness'
import { StalenessBreakpoints } from '@/types/staleness'
import { ConversationIndex } from '@/lib/conversationIndex'
import { compareText } from '@/lib/collation'
import { normalizeNumericInput } from '@/lib/digits'

export type TextOperator =
  | 'equals'
  | 'contains'
  | 'startsWith'
  | 'isSet'
  | 'notSet'

export type ComparableOperator = TextOperator | 'gt' | 'lt'

export type AddressKind = 'city' | 'state' | 'zip'
export type IdentityKind = 'name' | 'phone' | 'email'

export type ActiveFilter =
  | { kind: AddressKind | IdentityKind; op: TextOperator; value: string }
  | {
      kind: 'customField'
      defId: string
      op: ComparableOperator
      value: string
    }
  | { kind: 'pinStaleness'; value: ContactStaleness }
  | { kind: 'isFavorite' }
  | { kind: 'hasStudy' }
  | { kind: 'isActiveStudy' }
  | { kind: FollowUpFilterKind }

export type FollowUpFilterKind =
  | 'hasFollowUp'
  | 'noFollowUp'
  | 'followUpOverdue'

export const FOLLOW_UP_FILTER_KINDS: FollowUpFilterKind[] = [
  'hasFollowUp',
  'noFollowUp',
  'followUpOverdue',
]

export const isFollowUpFilterKind = (
  kind: string
): kind is FollowUpFilterKind =>
  (FOLLOW_UP_FILTER_KINDS as string[]).includes(kind)

export type FilterContext = {
  conversations: Visit[]
  customFieldDefs: CustomFieldDefinition[]

  stalenessBreakpoints: StalenessBreakpoints

  conversationIndex?: ConversationIndex
}

const norm = (v: unknown): string =>
  v == null ? '' : String(v).trim().toLocaleLowerCase()

const matchesText = (haystack: string, op: TextOperator, needle: string) => {
  const h = norm(haystack)
  const n = norm(needle)
  switch (op) {
    case 'equals':
      return h === n
    case 'contains':
      return h.includes(n)
    case 'startsWith':
      return h.startsWith(n)
    case 'isSet':
      return h.length > 0
    case 'notSet':
      return h.length === 0
  }
}

const compareAsNumberOrText = (
  rawA: string,
  rawB: string,
  op: 'gt' | 'lt'
): boolean => {
  const a = Number(normalizeNumericInput(rawA))
  const b = Number(normalizeNumericInput(rawB))
  if (Number.isFinite(a) && Number.isFinite(b)) {
    return op === 'gt' ? a > b : a < b
  }

  const cmp = compareText(norm(rawA), norm(rawB))
  return op === 'gt' ? cmp > 0 : cmp < 0
}

const compareAsDate = (
  rawA: string,
  rawB: string,
  op: 'gt' | 'lt'
): boolean => {
  const a = moment(rawA)
  const b = moment(rawB)
  if (a.isValid() && b.isValid()) {
    return op === 'gt' ? a.isAfter(b) : a.isBefore(b)
  }
  return compareAsNumberOrText(rawA, rawB, op)
}

const getIdentityField = (contact: Contact, kind: IdentityKind): string => {
  switch (kind) {
    case 'name':
      return contact.name ?? ''
    case 'phone':
      return contact.phone ?? ''
    case 'email':
      return contact.email ?? ''
  }
}

const getAddressField = (contact: Contact, kind: AddressKind): string => {
  return contact.address?.[kind] ?? ''
}

const contactVisits = (contact: Contact, conversations: Visit[]) =>
  conversations.filter((v) => v.contact.id === contact.id)

const hasUpcomingFollowUp = (
  contact: Contact,
  conversations: Visit[],
  now: Date
) => {
  const visits = contactVisits(contact, conversations)
  const missedBefore =
    now.getTime() - MISSED_FOLLOW_UP_AFTER_HOURS * 60 * 60 * 1000
  return visits.some(
    (v) =>
      isAppointment(v) &&
      new Date(v.followUp!.date).getTime() > missedBefore &&
      !followUpAnswer(v, visits)
  )
}

const hasMissedFollowUp = (
  contact: Contact,
  conversations: Visit[],
  now: Date
) =>
  overdueFollowUpConversations({
    currentTime: now,
    conversations: contactVisits(contact, conversations),
    lookbackDays: MISSED_FOLLOW_UP_LOOKBACK_DAYS,
  }).length > 0

const passesFilter = (
  contact: Contact,
  filter: ActiveFilter,
  ctx: FilterContext
): boolean => {
  switch (filter.kind) {
    case 'name':
    case 'phone':
    case 'email':
      return matchesText(
        getIdentityField(contact, filter.kind),
        filter.op,
        filter.value
      )
    case 'city':
    case 'state':
    case 'zip':
      return matchesText(
        getAddressField(contact, filter.kind),
        filter.op,
        filter.value
      )
    case 'customField': {
      const raw = contact.customFields?.[filter.defId] ?? ''
      if (filter.op === 'gt' || filter.op === 'lt') {
        const def = ctx.customFieldDefs.find((d) => d.id === filter.defId)
        if (!raw || !filter.value) return false
        if (def?.type === 'date') {
          return compareAsDate(raw, filter.value, filter.op)
        }
        return compareAsNumberOrText(raw, filter.value, filter.op)
      }
      return matchesText(raw, filter.op, filter.value)
    }
    case 'pinStaleness':
      if (ctx.conversationIndex) {
        return ctx.conversationIndex.stalenessFor(contact.id) === filter.value
      }
      return (
        getContactStaleness(
          contact,
          ctx.conversations,
          ctx.stalenessBreakpoints
        ) === filter.value
      )
    case 'isFavorite':
      return !!contact.isFavorite
    case 'hasStudy':
      if (ctx.conversationIndex) {
        return ctx.conversationIndex.studyContactIds.has(contact.id)
      }
      return contactHasAtLeastOneStudy({
        conversations: ctx.conversations,
        contact,
      })
    case 'isActiveStudy':
      if (ctx.conversationIndex) {
        return ctx.conversationIndex.studiedThisMonthIds.has(contact.id)
      }
      return contactStudiedForGivenMonth({
        conversations: ctx.conversations,
        contact,
        month: new Date(),
      })
    case 'hasFollowUp':
    case 'noFollowUp': {
      const upcoming = ctx.conversationIndex
        ? ctx.conversationIndex.nextFollowUpMs.has(contact.id)
        : hasUpcomingFollowUp(contact, ctx.conversations, new Date())
      return filter.kind === 'hasFollowUp' ? upcoming : !upcoming
    }
    case 'followUpOverdue':
      if (ctx.conversationIndex) {
        return ctx.conversationIndex.missedFollowUpMs.has(contact.id)
      }
      return hasMissedFollowUp(contact, ctx.conversations, new Date())
  }
}

export const applyFilters = (
  contacts: Contact[],
  filters: ActiveFilter[],
  ctx: FilterContext
): Contact[] => {
  if (filters.length === 0) return contacts
  return contacts.filter((c) => filters.every((f) => passesFilter(c, f, ctx)))
}
