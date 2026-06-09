import moment from 'moment'
import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'
import { CustomFieldDefinition } from '@/types/customField'
import { ContactStaleness } from '@/lib/contactStaleness'

export type ContactSortDirection = 'asc' | 'desc'

/**
 * Persisted sort key. Most values are bare identifiers; custom-field sorts
 * encode the field's UUID as `customField:<defId>` so the persisted shape stays
 * a plain string and still survives a custom-field deletion (we treat unknown
 * defs as "no values everywhere", which sorts to the end).
 */
export type ContactSortKey =
  | 'suggested'
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
  conversations: Visit[]
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

/**
 * Per-contact sort values, computed once in a single pass over `conversations`
 * (see {@link buildConversationAggregates}). The comparator reads these in O(1)
 * instead of re-scanning every conversation — and re-allocating `moment`
 * objects — inside each of the O(n log n) comparisons.
 */
type ConversationAggregates = {
  mostRecentConvUnix: Map<string, number>
  mostRecentStudyUnix: Map<string, number>
  studyContactIds: Set<string>
  studiedThisMonthIds: Set<string>
  stalenessRankFor: (contactId: string) => number
}

const buildConversationAggregates = (
  conversations: Visit[]
): ConversationAggregates => {
  const mostRecentConvUnix = new Map<string, number>()
  const mostRecentStudyUnix = new Map<string, number>()
  const studyContactIds = new Set<string>()
  const studiedThisMonthIds = new Set<string>()
  const currentMonth = moment()

  for (const c of conversations) {
    const id = c.contact.id
    const m = moment(c.date)
    const unix = m.unix()

    const prevConv = mostRecentConvUnix.get(id)
    if (prevConv === undefined || unix > prevConv) {
      mostRecentConvUnix.set(id, unix)
    }

    if (c.isBibleStudy) {
      studyContactIds.add(id)
      const prevStudy = mostRecentStudyUnix.get(id)
      if (prevStudy === undefined || unix > prevStudy) {
        mostRecentStudyUnix.set(id, unix)
      }
      if (m.isSame(currentMonth, 'month')) {
        studiedThisMonthIds.add(id)
      }
    }
  }

  // Pre-resolve the staleness bucket thresholds to plain unix seconds so the
  // per-contact classification is integer comparison, not moment construction.
  // Mirrors getContactStaleness: before(now - 1 month) → month, etc.
  const monthAgoUnix = moment().subtract(1, 'month').unix()
  const weekAgoUnix = moment().subtract(1, 'week').unix()
  const stalenessRankFor = (contactId: string): number => {
    const unix = mostRecentConvUnix.get(contactId)
    if (unix === undefined) return stalenessRank.never
    if (unix < monthAgoUnix) return stalenessRank.month
    if (unix < weekAgoUnix) return stalenessRank.week
    return stalenessRank.recent
  }

  return {
    mostRecentConvUnix,
    mostRecentStudyUnix,
    studyContactIds,
    studiedThisMonthIds,
    stalenessRankFor,
  }
}

const compareKey = (
  a: Contact,
  b: Contact,
  sort: ContactSortKey,
  ctx: SortContext,
  agg: ConversationAggregates
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
    case 'suggested':
    case 'recentConversation': {
      const ar = agg.mostRecentConvUnix.get(a.id)
      const br = agg.mostRecentConvUnix.get(b.id)
      if (ar === undefined || br === undefined) {
        return missing(ar !== undefined, br !== undefined)
      }
      return ar - br
    }
    case 'az':
      return a.name.localeCompare(b.name)
    case 'za':
      return b.name.localeCompare(a.name)
    case 'bibleStudy': {
      const ar = agg.mostRecentStudyUnix.get(a.id)
      const br = agg.mostRecentStudyUnix.get(b.id)
      if (ar === undefined || br === undefined) {
        return missing(ar !== undefined, br !== undefined)
      }
      return ar - br
    }
    case 'pinStaleness':
      return agg.stalenessRankFor(a.id) - agg.stalenessRankFor(b.id)
    case 'createdAt': {
      const am = a.createdAt ? moment(a.createdAt) : null
      const bm = b.createdAt ? moment(b.createdAt) : null
      const aSet = !!am && am.isValid()
      const bSet = !!bm && bm.isValid()
      if (!aSet || !bSet) return missing(aSet, bSet)
      return am!.unix() - bm!.unix()
    }
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
 * Builds a comparator. The `'suggested'` sort is the default and applies a
 * "favorites first, then active bible studies, then lapsed studies, then by
 * recent conversation" tiering — it's what existing users expect from a smart
 * default. Every other sort key is a pure sort: no favorite or study pinning,
 * just the chosen axis. That keeps "Recent Visit" honest (you asked for a sort,
 * you get a sort), and the user picks `'suggested'` when they want the smart
 * layering.
 *
 * Direction flips only the sort-key axis. Sentinels (undefined values) always
 * sort last regardless of direction.
 */
export const buildContactComparator = (
  sort: ContactSortKey,
  direction: ContactSortDirection,
  ctx: SortContext
) => {
  const applyPinning = sort === 'suggested'
  // Single pass over conversations; the comparator reads these maps in O(1).
  const agg = buildConversationAggregates(ctx.conversations)
  const studyTier = (c: Contact): number => {
    if (!agg.studyContactIds.has(c.id)) return 0
    return agg.studiedThisMonthIds.has(c.id) ? 2 : 1
  }
  const dirMul = direction === 'desc' ? -1 : 1

  return (a: Contact, b: Contact): number => {
    if (applyPinning) {
      if (!!a.isFavorite !== !!b.isFavorite) return a.isFavorite ? -1 : 1
      const at = studyTier(a)
      const bt = studyTier(b)
      if (at !== bt) return bt - at
    }
    const result = compareKey(a, b, sort, ctx, agg)
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
