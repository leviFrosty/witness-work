import { parsePhoneNumber } from '@/lib/parsePhoneNumber'
import { formatRelative } from '@/lib/dates'
import { compareText } from '@/lib/collation'
import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'
import {
  DefaultNavigationMapProvider,
  WidgetContactSort,
} from '@/stores/preferences'
import { addressToString, coordinateAsString } from '@/lib/address'
import { ContactStaleness } from '@/lib/contactStaleness'
import { StalenessBreakpoints } from '@/types/staleness'
import { buildConversationIndex } from '@/lib/conversationIndex'
import links from '@/constants/links'

export type WidgetContact = {
  id: string
  name: string

  phone: string | null

  telUrl: string | null

  smsUrl: string | null

  mapsUrl: string | null

  lastConversationAt: number | null

  lastContactedRelative: string | null

  isBibleStudy: boolean

  isFavorite: boolean

  staleness: ContactStaleness
}

export type BuildContactsArgs = {
  contacts: Contact[]
  conversations: Visit[]
  defaultNavigationMapProvider: DefaultNavigationMapProvider

  defaultPhoneRegionCode: string

  sort: WidgetContactSort

  stalenessBreakpoints: StalenessBreakpoints
}

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

type SortableContact = Pick<
  WidgetContact,
  'name' | 'lastConversationAt' | 'isBibleStudy' | 'isFavorite'
>

function compareBySort(
  a: SortableContact,
  b: SortableContact,
  sort: WidgetContactSort
): number {
  switch (sort) {
    case 'longestContacted': {
      if (a.lastConversationAt === null && b.lastConversationAt === null)
        return compareText(a.name, b.name)
      if (a.lastConversationAt === null) return -1
      if (b.lastConversationAt === null) return 1
      return a.lastConversationAt - b.lastConversationAt
    }
    case 'recentConversation': {
      if (a.lastConversationAt && b.lastConversationAt)
        return b.lastConversationAt - a.lastConversationAt
      if (a.lastConversationAt) return -1
      if (b.lastConversationAt) return 1
      return compareText(a.name, b.name)
    }
    case 'az':
      return compareText(a.name, b.name)
    case 'bibleStudy': {
      if (a.isBibleStudy !== b.isBibleStudy) return a.isBibleStudy ? -1 : 1
      return compareBySort(a, b, 'recentConversation')
    }
  }
}

export function buildContacts(args: BuildContactsArgs): WidgetContact[] {
  const now = Date.now()

  const index = buildConversationIndex(
    args.conversations,
    args.stalenessBreakpoints
  )

  const visible = args.contacts.filter((c) => {
    if (!c.dismissedUntil) return true
    return new Date(c.dismissedUntil).getTime() <= now
  })

  const sortable = visible.map((contact) => ({
    contact,
    name: contact.name,
    lastConversationAt: index.mostRecentConvMs.get(contact.id) ?? null,
    isBibleStudy: index.studyContactIds.has(contact.id),
    isFavorite: !!contact.isFavorite,
  }))

  const studiesAboveOthers = args.sort !== 'bibleStudy'
  sortable.sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
    if (studiesAboveOthers && a.isBibleStudy !== b.isBibleStudy)
      return a.isBibleStudy ? -1 : 1
    return compareBySort(a, b, args.sort)
  })

  return sortable.slice(0, MAX_CONTACTS).map(({ contact, ...keys }) => {
    const recent = index.mostRecentConvByContact.get(contact.id)
    return {
      id: contact.id,
      ...keys,
      ...buildPhoneUrls(contact, args.defaultPhoneRegionCode),
      mapsUrl: buildMapsUrl(contact, args.defaultNavigationMapProvider),
      lastContactedRelative: recent ? formatRelative(recent.date) : null,
      staleness: index.stalenessFor(contact.id),
    }
  })
}
