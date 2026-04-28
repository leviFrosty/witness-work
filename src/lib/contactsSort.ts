import moment from 'moment'
import { Contact } from '../types/contact'
import { Conversation } from '../types/conversation'
import { CustomFieldDefinition } from '../types/customField'
import { ContactStaleness, getContactStaleness } from './contactStaleness'
import {
  contactMostRecentStudy,
  contactStudiedForGivenMonth,
} from './conversations'
import { getMostRecentConversationForContact } from './contacts'

export type ContactSortDirection = 'asc' | 'desc'

/**
 * Persisted sort key. Most values are bare identifiers; custom-field sorts
 * encode the field's UUID as `customField:<defId>` so the persisted shape stays
 * a plain string and still survives a custom-field deletion (we treat unknown
 * defs as "no values everywhere", which sorts to the end).
 */
export type ContactSortKey =
  | 'recentConversation'
  | 'az'
  | 'za'
  | 'bibleStudy'
  | 'pinStaleness'
  | 'createdAt'
  | 'city'
  | 'state'
  | 'zip'
  | `customField:${string}`

export type SortContext = {
  conversations: Conversation[]
  customFieldDefs: CustomFieldDefinition[]
}

const stalenessRank: Record<ContactStaleness, number> = {
  never: 0,
  recent: 1,
  week: 2,
  month: 3,
}

/**
 * Sentinel returned by the per-key comparators when one side is "missing" — the
 * caller in {@link buildContactComparator} treats this specially so direction
 * (asc/desc) doesn't accidentally pull undefined values to the top under desc.
 * Real value-vs-value comparisons return regular numbers and the direction
 * multiplier flips them as expected.
 */
type KeyCompare = number | { aMissing: boolean; bMissing: boolean }

const isMissingResult = (
  v: KeyCompare
): v is { aMissing: boolean; bMissing: boolean } =>
  typeof v === 'object' && v !== null

const missing = (aSet: boolean, bSet: boolean): KeyCompare => ({
  aMissing: !aSet,
  bMissing: !bSet,
})

const localeCmp = (
  a: string | undefined,
  b: string | undefined
): KeyCompare => {
  const aSet = !!a && a.length > 0
  const bSet = !!b && b.length > 0
  if (!aSet || !bSet) return missing(aSet, bSet)
  return a!.localeCompare(b!)
}

const dateCmp = (a: string | undefined, b: string | undefined): KeyCompare => {
  const aSet = !!a && a.length > 0
  const bSet = !!b && b.length > 0
  if (!aSet || !bSet) return missing(aSet, bSet)
  const am = moment(a)
  const bm = moment(b)
  if (am.isValid() && bm.isValid()) return am.unix() - bm.unix()
  return localeCmp(a, b)
}

const numberCmp = (
  a: string | undefined,
  b: string | undefined
): KeyCompare => {
  const aSet = !!a && a.length > 0
  const bSet = !!b && b.length > 0
  if (!aSet || !bSet) return missing(aSet, bSet)
  const an = Number(a)
  const bn = Number(b)
  if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn
  return localeCmp(a, b)
}

const compareKey = (
  a: Contact,
  b: Contact,
  sort: ContactSortKey,
  ctx: SortContext
): KeyCompare => {
  if (sort.startsWith('customField:')) {
    const defId = sort.slice('customField:'.length)
    const def = ctx.customFieldDefs.find((d) => d.id === defId)
    const av = a.customFields?.[defId]
    const bv = b.customFields?.[defId]
    if (def?.type === 'number') return numberCmp(av, bv)
    if (def?.type === 'date') return dateCmp(av, bv)
    return localeCmp(av, bv)
  }
  switch (sort) {
    case 'recentConversation': {
      const ar = getMostRecentConversationForContact({
        conversations: ctx.conversations,
        contact: a,
      })
      const br = getMostRecentConversationForContact({
        conversations: ctx.conversations,
        contact: b,
      })
      if (!ar || !br) return missing(!!ar, !!br)
      return moment(ar.date).unix() - moment(br.date).unix()
    }
    case 'az':
      return a.name.localeCompare(b.name)
    case 'za':
      return b.name.localeCompare(a.name)
    case 'bibleStudy': {
      const ar = contactMostRecentStudy({
        conversations: ctx.conversations,
        contact: a,
      })
      const br = contactMostRecentStudy({
        conversations: ctx.conversations,
        contact: b,
      })
      if (!ar || !br) return missing(!!ar, !!br)
      return moment(ar.date).unix() - moment(br.date).unix()
    }
    case 'pinStaleness':
      return (
        stalenessRank[getContactStaleness(a, ctx.conversations)] -
        stalenessRank[getContactStaleness(b, ctx.conversations)]
      )
    case 'createdAt':
      return a.createdAt.getTime() - b.createdAt.getTime()
    case 'city':
      return localeCmp(a.address?.city, b.address?.city)
    case 'state':
      return localeCmp(a.address?.state, b.address?.state)
    case 'zip':
      return localeCmp(a.address?.zip, b.address?.zip)
    default:
      return 0
  }
}

/**
 * Builds a comparator that preserves "favorites pinned to top, then bible
 * studies above non-studies (when not the sort key), then the selected sort
 * key." Direction flips only the sort-key axis — pins remain on top regardless.
 * Sentinels (undefined values) always sort last.
 */
export const buildContactComparator = (
  sort: ContactSortKey,
  direction: ContactSortDirection,
  ctx: SortContext
) => {
  const studiesAboveOthers = sort !== 'bibleStudy'
  const studyContactIds = new Set(
    ctx.conversations.filter((c) => c.isBibleStudy).map((c) => c.contact.id)
  )
  const isStudy = (c: Contact) => studyContactIds.has(c.id)
  const isActive = (c: Contact) =>
    contactStudiedForGivenMonth({
      conversations: ctx.conversations,
      contact: c,
      month: new Date(),
    })
  const studyTier = (c: Contact): number => {
    if (!isStudy(c)) return 0
    return isActive(c) ? 2 : 1
  }
  const dirMul = direction === 'desc' ? -1 : 1

  return (a: Contact, b: Contact): number => {
    if (!!a.isFavorite !== !!b.isFavorite) return a.isFavorite ? -1 : 1
    if (studiesAboveOthers) {
      const at = studyTier(a)
      const bt = studyTier(b)
      if (at !== bt) return bt - at
    }
    const result = compareKey(a, b, sort, ctx)
    if (isMissingResult(result)) {
      // Both missing → tie; one missing → that side goes last regardless of
      // direction. The user's intent for "undefineds last" doesn't flip with
      // asc/desc.
      if (result.aMissing && result.bMissing) return 0
      return result.aMissing ? 1 : -1
    }
    return result * dirMul
  }
}
