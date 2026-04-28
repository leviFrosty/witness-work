import moment from 'moment'
import { Contact } from '../types/contact'
import { Conversation } from '../types/conversation'
import { CustomFieldDefinition } from '../types/customField'
import {
  contactHasAtLeastOneStudy,
  contactStudiedForGivenMonth,
} from './conversations'
import { ContactStaleness, getContactStaleness } from './contactStaleness'

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

export type FilterContext = {
  conversations: Conversation[]
  customFieldDefs: CustomFieldDefinition[]
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
  const a = Number(rawA)
  const b = Number(rawB)
  if (Number.isFinite(a) && Number.isFinite(b)) {
    return op === 'gt' ? a > b : a < b
  }
  // fallback: lexicographic
  const cmp = norm(rawA).localeCompare(norm(rawB))
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
      return getContactStaleness(contact, ctx.conversations) === filter.value
    case 'isFavorite':
      return !!contact.isFavorite
    case 'hasStudy':
      return contactHasAtLeastOneStudy({
        conversations: ctx.conversations,
        contact,
      })
    case 'isActiveStudy':
      return contactStudiedForGivenMonth({
        conversations: ctx.conversations,
        contact,
        month: new Date(),
      })
  }
}

/**
 * Returns the subset of `contacts` matching every filter (logical AND). Empty
 * filter list returns the input unchanged.
 */
export const applyFilters = (
  contacts: Contact[],
  filters: ActiveFilter[],
  ctx: FilterContext
): Contact[] => {
  if (filters.length === 0) return contacts
  return contacts.filter((c) => filters.every((f) => passesFilter(c, f, ctx)))
}
