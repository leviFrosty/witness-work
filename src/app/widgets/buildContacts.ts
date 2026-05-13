import moment from 'moment'
import { parsePhoneNumber } from 'awesome-phonenumber'
import { Contact } from '@/types/contact'
import { Conversation } from '@/types/conversation'
import {
  DefaultNavigationMapProvider,
  WidgetContactSort,
} from '@/stores/preferences'
import { addressToString, coordinateAsString } from '@/lib/address'
import { getMostRecentConversationForContact } from '@/lib/contacts'
import { ContactStaleness, getContactStaleness } from '@/lib/contactStaleness'
import links from '@/constants/links'

export type WidgetContact = {
  id: string
  name: string
  /**
   * E.164 phone string (e.g. `+15551234567`) or `null` when the contact has no
   * valid phone number. E.164 is what `tel:`/`sms:` handlers on iOS expect.
   */
  phone: string | null
  /** Pre-built `tel:` URL or `null`. */
  telUrl: string | null
  /** Pre-built `sms:` URL or `null`. */
  smsUrl: string | null
  /** Pre-built maps URL using the user's preferred provider, or `null`. */
  mapsUrl: string | null
  /**
   * Epoch ms of the most recent conversation with this contact, or `null` for
   * contacts with no conversation history. Used as the secondary sort key.
   */
  lastConversationAt: number | null
  /**
   * Pre-translated relative date string (e.g. `"3 days ago"`, `"2 weeks ago"`)
   * for the most recent conversation, or `null` if there is none. Locale
   * follows the app locale at write time.
   */
  lastContactedRelative: string | null
  /** Whether this contact has at least one conversation flagged as a study. */
  isBibleStudy: boolean
  /** True when the user has favorited this contact. */
  isFavorite: boolean
  /**
   * Staleness bucket for the colored indicator dot. Mirrors the same logic used
   * by the in-app pin colors so the widget feels consistent.
   */
  staleness: ContactStaleness
}

export type BuildContactsArgs = {
  contacts: Contact[]
  conversations: Conversation[]
  defaultNavigationMapProvider: DefaultNavigationMapProvider
  /**
   * Region code (`'US'`, `'GB'`, etc.) used to parse phone numbers that were
   * stored in national format. Falls back to `''` if unknown.
   */
  defaultPhoneRegionCode: string
  /** User-selected sort for the Contacts widget. */
  sort: WidgetContactSort
}

/** Cap how many contacts we serialize. The widget renders 1/4/8 per family. */
const MAX_CONTACTS = 12

function buildPhoneUrls(
  contact: Contact,
  fallbackRegion: string
): Pick<WidgetContact, 'phone' | 'telUrl' | 'smsUrl'> {
  if (!contact.phone) return { phone: null, telUrl: null, smsUrl: null }
  const parsed = parsePhoneNumber(contact.phone, {
    regionCode: contact.phoneRegionCode || fallbackRegion || '',
  })
  if (!parsed.valid) return { phone: null, telUrl: null, smsUrl: null }
  const e164 = parsed.number.e164
  return {
    phone: e164,
    telUrl: `tel:${e164}`,
    smsUrl: `sms:${e164}`,
  }
}

function buildMapsUrl(
  contact: Contact,
  provider: DefaultNavigationMapProvider
): string | null {
  const hasAddress =
    !!contact.address && Object.values(contact.address).some(Boolean)
  if (!hasAddress && !contact.coordinate) return null

  const base = (() => {
    switch (provider) {
      case 'google':
        return links.googleMapsBase
      case 'waze':
        return links.wazeMapsBase
      case 'apple':
      default:
        return links.appleMapsBase
    }
  })()

  const query = contact.userDraggedCoordinate
    ? coordinateAsString(contact)
    : addressToString(contact.address)
  if (!query) return null

  return `${base}${encodeURIComponent(query)}`
}

/**
 * Compare two contacts by the user-selected widget sort. Used as the inner
 * comparator after favorites/studies tiering has been applied.
 */
function compareBySort(
  a: WidgetContact,
  b: WidgetContact,
  sort: WidgetContactSort
): number {
  switch (sort) {
    case 'longestContacted': {
      // Never-contacted come first (most needy), then oldest contact.
      if (a.lastConversationAt === null && b.lastConversationAt === null)
        return a.name.localeCompare(b.name)
      if (a.lastConversationAt === null) return -1
      if (b.lastConversationAt === null) return 1
      return a.lastConversationAt - b.lastConversationAt
    }
    case 'recentConversation': {
      if (a.lastConversationAt && b.lastConversationAt)
        return b.lastConversationAt - a.lastConversationAt
      if (a.lastConversationAt) return -1
      if (b.lastConversationAt) return 1
      return a.name.localeCompare(b.name)
    }
    case 'az':
      return a.name.localeCompare(b.name)
    case 'bibleStudy': {
      // Studies first, then by recent conversation as tiebreaker.
      if (a.isBibleStudy !== b.isBibleStudy) return a.isBibleStudy ? -1 : 1
      return compareBySort(a, b, 'recentConversation')
    }
  }
}

export function buildContacts(args: BuildContactsArgs): WidgetContact[] {
  const now = Date.now()
  const studyIds = new Set(
    args.conversations.filter((c) => c.isBibleStudy).map((c) => c.contact.id)
  )

  // Skip contacts the user has dismissed (snoozed) until that date passes.
  const visible = args.contacts.filter((c) => {
    if (!c.dismissedUntil) return true
    return moment(c.dismissedUntil).valueOf() <= now
  })

  const enriched = visible.map((contact): WidgetContact => {
    const recent = getMostRecentConversationForContact({
      contact,
      conversations: args.conversations,
    })
    const lastConversationAt = recent ? moment(recent.date).valueOf() : null
    const lastContactedRelative = recent ? moment(recent.date).fromNow() : null

    return {
      id: contact.id,
      name: contact.name,
      ...buildPhoneUrls(contact, args.defaultPhoneRegionCode),
      mapsUrl: buildMapsUrl(contact, args.defaultNavigationMapProvider),
      lastConversationAt,
      lastContactedRelative,
      isBibleStudy: studyIds.has(contact.id),
      isFavorite: !!contact.isFavorite,
      staleness: getContactStaleness(contact, args.conversations),
    }
  })

  // Tier ordering: favorites → bible studies → user-selected sort.
  // Studies-first only applies *outside* the bibleStudy sort (which already
  // surfaces studies via its own ordering).
  const studiesAboveOthers = args.sort !== 'bibleStudy'
  enriched.sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
    if (studiesAboveOthers && a.isBibleStudy !== b.isBibleStudy)
      return a.isBibleStudy ? -1 : 1
    return compareBySort(a, b, args.sort)
  })

  return enriched.slice(0, MAX_CONTACTS)
}
