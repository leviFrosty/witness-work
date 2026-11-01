import Fuse, { FuseResultMatch, IFuseOptions, RangeTuple } from 'fuse.js'
import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'
import {
  foldArabicForSearch,
  foldArabicWithIndexMap,
  unfoldRange,
} from '@/lib/searchNormalize'

export type ContactSearchEntry<C extends Contact = Contact> = {
  contact: C
  notes: string
  customFieldValues: string
}

export type ContactSearchMatch<C extends Contact = Contact> = {
  contact: C
  matches?: readonly FuseResultMatch[]
}

const buildEntries = <C extends Contact>(
  contacts: C[],
  conversations: Visit[]
): ContactSearchEntry<C>[] => {
  const notesByContactId = new Map<string, string[]>()
  for (const c of conversations) {
    if (!c.note) continue
    const list = notesByContactId.get(c.contact.id) ?? []
    list.push(c.note)
    notesByContactId.set(c.contact.id, list)
  }
  return contacts.map((contact) => ({
    contact,
    notes: (notesByContactId.get(contact.id) ?? []).join(' • '),
    customFieldValues: contact.customFields
      ? Object.values(contact.customFields).filter(Boolean).join(' • ')
      : '',
  }))
}

const FUSE_KEYS: IFuseOptions<ContactSearchEntry>['keys'] = [
  { name: 'contact.name', weight: 0.35 },
  { name: 'customFieldValues', weight: 0.25 },
  { name: 'notes', weight: 0.2 },
  { name: 'contact.phone', weight: 0.15 },
  { name: 'contact.email', weight: 0.15 },
  { name: 'contact.address.line1', weight: 0.1 },
  { name: 'contact.address.city', weight: 0.05 },
  { name: 'contact.address.state', weight: 0.05 },
  { name: 'contact.address.zip', weight: 0.05 },
]

const getFoldedValue: IFuseOptions<ContactSearchEntry>['getFn'] = (
  entry,
  path
) => {
  const value: unknown = Fuse.config.getFn(entry, path)
  if (typeof value === 'string') return foldArabicForSearch(value)
  if (Array.isArray(value))
    return value.map((item) =>
      typeof item === 'string' ? foldArabicForSearch(item) : item
    )
  return value as string
}

const unfoldMatch = (
  entry: ContactSearchEntry,
  match: FuseResultMatch
): FuseResultMatch => {
  if (!match.key) return match
  const source: unknown = Fuse.config.getFn(entry, match.key)
  if (typeof source !== 'string') return match
  const map = foldArabicWithIndexMap(source)
  if (!map || map.folded !== match.value) return match
  return {
    ...match,
    value: source,
    indices: match.indices.map((range) =>
      unfoldRange(range, map, source.length)
    ),
  }
}

export const buildContactsFuse = <C extends Contact>(
  contacts: C[],
  conversations: Visit[]
): Fuse<ContactSearchEntry<C>> => {
  const entries = buildEntries(contacts, conversations)
  return new Fuse(entries, {
    keys: FUSE_KEYS,
    getFn: getFoldedValue,

    threshold: 0.6,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeScore: false,

    includeMatches: true,
  })
}

const lastSearches = new WeakMap<
  object,
  { query: string; contacts: Contact[]; results: ContactSearchMatch[] }
>()

export const searchContactsFuzzy = <C extends Contact>(
  query: string,
  fuse: Fuse<ContactSearchEntry<C>>,
  contacts: C[]
): ContactSearchMatch<C>[] => {
  const trimmed = query.trim()
  if (trimmed.length === 0) return contacts.map((contact) => ({ contact }))
  const last = lastSearches.get(fuse)
  if (last && last.query === trimmed && last.contacts === contacts) {
    return last.results as ContactSearchMatch<C>[]
  }
  const results = fuse.search(foldArabicForSearch(trimmed)).map((r) => ({
    contact: r.item.contact,
    matches: r.matches?.map((match) => unfoldMatch(r.item, match)),
  }))
  lastSearches.set(fuse, { query: trimmed, contacts, results })
  return results
}

export type MatchSource =
  | 'name'
  | 'note'
  | 'customField'
  | 'phone'
  | 'email'
  | 'address'

export const matchSourceForKey = (
  key: string | undefined
): MatchSource | undefined => {
  if (!key) return undefined
  if (key === 'contact.name') return 'name'
  if (key === 'notes') return 'note'
  if (key === 'customFieldValues') return 'customField'
  if (key === 'contact.phone') return 'phone'
  if (key === 'contact.email') return 'email'
  if (key.startsWith('contact.address.')) return 'address'
  return undefined
}

const PREVIEW_PRIORITY: Record<MatchSource, number> = {
  customField: 0,
  note: 1,
  email: 2,
  phone: 3,
  address: 4,
  name: Number.POSITIVE_INFINITY,
}

export const findNameMatch = (
  matches: readonly FuseResultMatch[] | undefined
): FuseResultMatch | undefined =>
  matches?.find((m) => matchSourceForKey(m.key) === 'name')

export const pickPreviewMatch = (
  matches: readonly FuseResultMatch[] | undefined
):
  | { match: FuseResultMatch; source: Exclude<MatchSource, 'name'> }
  | undefined => {
  if (!matches?.length) return undefined
  let best:
    | { match: FuseResultMatch; source: Exclude<MatchSource, 'name'> }
    | undefined
  for (const m of matches) {
    const source = matchSourceForKey(m.key)
    if (!source || source === 'name') continue
    const candidate = { match: m, source }
    if (
      !best ||
      PREVIEW_PRIORITY[candidate.source] < PREVIEW_PRIORITY[best.source]
    ) {
      best = candidate
    }
  }
  return best
}

export type SnippetSegment = { text: string; highlighted: boolean }

export type SnippetResult = {
  segments: SnippetSegment[]
  truncatedStart: boolean
  truncatedEnd: boolean
}

const isUsableRange = ([s, e]: RangeTuple): boolean => e - s + 1 >= 2

export const buildSnippet = (
  text: string,
  indices: readonly RangeTuple[],
  contextChars?: number
): SnippetResult => {
  const usable = indices.filter(isUsableRange)
  if (usable.length === 0 || text.length === 0) {
    return {
      segments: text ? [{ text, highlighted: false }] : [],
      truncatedStart: false,
      truncatedEnd: false,
    }
  }

  let windowStart = 0
  let windowEnd = text.length
  if (typeof contextChars === 'number') {
    const [firstStart, firstEnd] = usable[0]
    windowStart = Math.max(0, firstStart - contextChars)
    windowEnd = Math.min(text.length, firstEnd + 1 + contextChars)
  }

  const segments: SnippetSegment[] = []
  let cursor = windowStart
  for (const [start, end] of usable) {
    const matchStart = start
    const matchEnd = end + 1
    if (matchEnd <= windowStart || matchStart >= windowEnd) continue
    const clampedStart = Math.max(matchStart, windowStart)
    const clampedEnd = Math.min(matchEnd, windowEnd)
    if (cursor < clampedStart) {
      segments.push({
        text: text.slice(cursor, clampedStart),
        highlighted: false,
      })
    }
    if (clampedEnd > clampedStart) {
      segments.push({
        text: text.slice(clampedStart, clampedEnd),
        highlighted: true,
      })
    }
    cursor = clampedEnd
  }
  if (cursor < windowEnd) {
    segments.push({
      text: text.slice(cursor, windowEnd),
      highlighted: false,
    })
  }

  return {
    segments,
    truncatedStart: windowStart > 0,
    truncatedEnd: windowEnd < text.length,
  }
}
