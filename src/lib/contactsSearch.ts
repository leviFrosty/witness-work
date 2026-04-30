import Fuse, { FuseResultMatch, IFuseOptions, RangeTuple } from 'fuse.js'
import { Contact } from '../types/contact'
import { Conversation } from '../types/conversation'

export type ContactSearchEntry = {
  contact: Contact
  notes: string
  customFieldValues: string
}

/**
 * Result of a fuzzy search. `matches` is populated only for contacts that came
 * back via Fuse (empty queries short-circuit and return all contacts with
 * `matches: undefined`). Per-key match details power the inline highlighting
 * and snippet preview in `ContactRow`.
 */
export type ContactSearchMatch = {
  contact: Contact
  matches?: readonly FuseResultMatch[]
}

const buildEntries = (
  contacts: Contact[],
  conversations: Conversation[]
): ContactSearchEntry[] => {
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

// Weights are relative — Fuse normalizes them internally. Name still leads
// (it's the primary identifier), but we keep its lead modest so a strong
// match in a conversation note or a user-curated custom field can outrank a
// weak fuzzy hit on someone else's name. Custom fields rank just under name
// because the user typed them by hand — they're high-signal.
const FUSE_KEYS: IFuseOptions<ContactSearchEntry>['keys'] = [
  { name: 'contact.name', weight: 0.35 },
  { name: 'customFieldValues', weight: 0.25 },
  { name: 'notes', weight: 0.2 },
  { name: 'contact.phone', weight: 0.15 },
  { name: 'contact.email', weight: 0.15 },
  { name: 'contact.address.city', weight: 0.05 },
  { name: 'contact.address.state', weight: 0.05 },
  { name: 'contact.address.zip', weight: 0.05 },
]

export const buildContactsFuse = (
  contacts: Contact[],
  conversations: Conversation[]
): Fuse<ContactSearchEntry> => {
  const entries = buildEntries(contacts, conversations)
  return new Fuse(entries, {
    keys: FUSE_KEYS,
    // Loose enough to absorb single-letter transpositions ("jhon" → "John")
    // while still rejecting unrelated terms. With `ignoreLocation: true` and
    // weighted multi-key search, scores trend higher than fuse's default 0.6,
    // so we open up to 0.6 to catch typos in short fields like a first name.
    threshold: 0.6,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeScore: false,
    // Required to power the inline highlighting + preview snippet in the
    // contacts list. Per-key match indices and the matched value text travel
    // with each result.
    includeMatches: true,
  })
}

/**
 * Returns a fuzzy-matched subset of `contacts` for a free-text query.
 *
 * - Empty/whitespace query short-circuits to the full list (in original order),
 *   wrapped as `{ contact, matches: undefined }` so the caller can treat the
 *   shape uniformly.
 * - Builds a fresh Fuse index per call; callers should memoize against
 *   `[contacts, conversations]` to avoid rebuilding on every keystroke.
 */
export const searchContactsFuzzy = (
  query: string,
  fuse: Fuse<ContactSearchEntry>,
  contacts: Contact[]
): ContactSearchMatch[] => {
  const trimmed = query.trim()
  if (trimmed.length === 0) return contacts.map((contact) => ({ contact }))
  return fuse.search(trimmed).map((r) => ({
    contact: r.item.contact,
    matches: r.matches,
  }))
}

/**
 * Logical source of a matched key. Drives the icon + label shown alongside the
 * snippet preview in the contacts list.
 */
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

// Lower number = preferred for the snippet line. Custom fields and notes are
// the most informative because they carry user-authored prose; phone/email
// are useful but noisy; address is a last resort because the city already
// shows on the row's meta line.
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

/**
 * Picks the best non-name match for the snippet preview line. Returns
 * `undefined` when only the name matched (the inline name highlight already
 * covers that case) or when nothing matched at all.
 */
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

// Fuse's bitap occasionally reports single-character ranges — they're noise
// when rendered as inline highlights, so we drop them.
const isUsableRange = ([s, e]: RangeTuple): boolean => e - s + 1 >= 2

/**
 * Builds a renderable snippet from a Fuse match.
 *
 * - Without `contextChars`: returns the full text split into highlighted vs.
 *   non-highlighted segments. Used for short fields like a contact's name.
 * - With `contextChars`: windows the text around the first usable match, keeping
 *   ~`contextChars` characters on either side. Used for long fields like joined
 *   conversation notes.
 *
 * Index ranges shorter than 2 characters are dropped — they read as visual
 * noise in the list row and rarely correspond to a meaningful query token.
 */
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
