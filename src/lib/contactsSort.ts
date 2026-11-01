import moment from 'moment'
import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'
import { CustomFieldDefinition } from '@/types/customField'
import {
  buildConversationIndex,
  ConversationIndex,
} from '@/lib/conversationIndex'
import { DEFAULT_STALENESS_BREAKPOINTS } from '@/constants/staleness'
import { compareText } from '@/lib/collation'
import { normalizeNumericInput } from '@/lib/digits'

export type ContactSortDirection = 'asc' | 'desc'

export type ContactSortKey =
  | 'suggested'
  | 'recentConversation'
  | 'nextFollowUp'
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
  return compareText(a!, b!)
}

type UnixOf = (value: string | Date) => number | null

const cachedUnixOf = (): UnixOf => {
  const cache = new Map<string | Date, number | null>()
  return (value) => {
    let unix = cache.get(value)
    if (unix === undefined) {
      const parsed = moment(value)
      unix = parsed.isValid() ? parsed.unix() : null
      cache.set(value, unix)
    }
    return unix
  }
}

const dateCmp = (
  a: string | undefined,
  b: string | undefined,
  unixOf: UnixOf
): KeyCompare => {
  const aSet = !!a && a.length > 0
  const bSet = !!b && b.length > 0
  if (!aSet || !bSet) return missing(aSet, bSet)
  const au = unixOf(a!)
  const bu = unixOf(b!)
  if (au !== null && bu !== null) return au - bu
  return localeCmp(a, b)
}

const numberCmp = (
  a: string | undefined,
  b: string | undefined
): KeyCompare => {
  const aSet = !!a && a.length > 0
  const bSet = !!b && b.length > 0
  if (!aSet || !bSet) return missing(aSet, bSet)
  const an = Number(normalizeNumericInput(a!))
  const bn = Number(normalizeNumericInput(b!))
  if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn
  return localeCmp(a, b)
}

const compareKey = (
  a: Contact,
  b: Contact,
  sort: ContactSortKey,
  ctx: SortContext,
  index: ConversationIndex,
  unixOf: UnixOf
): KeyCompare => {
  if (sort.startsWith('customField:')) {
    const defId = sort.slice('customField:'.length)
    const def = ctx.customFieldDefs.find((d) => d.id === defId)
    const av = a.customFields?.[defId]
    const bv = b.customFields?.[defId]
    if (def?.type === 'number') return numberCmp(av, bv)
    if (def?.type === 'date') return dateCmp(av, bv, unixOf)
    return localeCmp(av, bv)
  }
  switch (sort) {
    case 'suggested':
    case 'recentConversation': {
      const ar = index.mostRecentConvMs.get(a.id)
      const br = index.mostRecentConvMs.get(b.id)
      if (ar === undefined || br === undefined) {
        return missing(ar !== undefined, br !== undefined)
      }
      return ar - br
    }
    case 'nextFollowUp': {
      const af = index.nextFollowUpMs.get(a.id)
      const bf = index.nextFollowUpMs.get(b.id)
      if (af === undefined && bf === undefined) {
        return missing(
          index.missedFollowUpMs.has(a.id),
          index.missedFollowUpMs.has(b.id)
        )
      }
      if (af === undefined || bf === undefined) {
        return missing(af !== undefined, bf !== undefined)
      }
      return bf - af
    }
    case 'az':
      return compareText(a.name, b.name)
    case 'za':
      return compareText(b.name, a.name)
    case 'bibleStudy': {
      const ar = index.mostRecentStudyMs.get(a.id)
      const br = index.mostRecentStudyMs.get(b.id)
      if (ar === undefined || br === undefined) {
        return missing(ar !== undefined, br !== undefined)
      }
      return ar - br
    }
    case 'pinStaleness':
      return index.stalenessRankFor(a.id) - index.stalenessRankFor(b.id)
    case 'createdAt': {
      const au = a.createdAt ? unixOf(a.createdAt) : null
      const bu = b.createdAt ? unixOf(b.createdAt) : null
      if (au === null || bu === null) return missing(au !== null, bu !== null)
      return au - bu
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

export const buildContactComparator = (
  sort: ContactSortKey,
  direction: ContactSortDirection,
  ctx: SortContext,

  index: ConversationIndex = buildConversationIndex(
    ctx.conversations,
    DEFAULT_STALENESS_BREAKPOINTS
  )
) => {
  const applyPinning = sort === 'suggested'
  const studyTier = (c: Contact): number => {
    if (!index.studyContactIds.has(c.id)) return 0
    return index.studiedThisMonthIds.has(c.id) ? 2 : 1
  }
  const dirMul = direction === 'desc' ? -1 : 1
  const unixOf = cachedUnixOf()

  return (a: Contact, b: Contact): number => {
    if (applyPinning) {
      if (!!a.isFavorite !== !!b.isFavorite) return a.isFavorite ? -1 : 1
      const at = studyTier(a)
      const bt = studyTier(b)
      if (at !== bt) return bt - at
    }
    const result = compareKey(a, b, sort, ctx, index, unixOf)
    if (isMissingResult(result)) {
      if (result.aMissing && result.bMissing) return 0
      return result.aMissing ? 1 : -1
    }
    return result * dirMul
  }
}
