import moment from 'moment'
import { parsePhoneNumber } from 'awesome-phonenumber'
import { Contact } from '../../types/contact'
import { Conversation } from '../../types/conversation'
import { DefaultNavigationMapProvider } from '../../stores/preferences'
import { addressToString, coordinateAsString } from '../address'
import { getMostRecentConversationForContact } from '../contacts'
import links from '../../constants/links'

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
  /** Whether this contact has at least one conversation flagged as a study. */
  isBibleStudy: boolean
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
}

/** Cap how many contacts we serialize. The widget renders 1/3/6 per family. */
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

    return {
      id: contact.id,
      name: contact.name,
      ...buildPhoneUrls(contact, args.defaultPhoneRegionCode),
      mapsUrl: buildMapsUrl(contact, args.defaultNavigationMapProvider),
      lastConversationAt,
      isBibleStudy: studyIds.has(contact.id),
    }
  })

  // Default sort: most-recently-contacted first, never-contacted last (then by
  // name). The widget App Intent re-sorts client-side based on user choice;
  // ordering here is just the fallback / "recent" mode.
  enriched.sort((a, b) => {
    if (a.lastConversationAt && b.lastConversationAt) {
      return b.lastConversationAt - a.lastConversationAt
    }
    if (a.lastConversationAt) return -1
    if (b.lastConversationAt) return 1
    return a.name.localeCompare(b.name)
  })

  return enriched.slice(0, MAX_CONTACTS)
}
